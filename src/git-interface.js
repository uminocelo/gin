const { spawn } = require('child_process');
const path = require('path');
const { exit } = require('process');
const fs = require('fs').promises;

class GitInterface {
  constructor(options) {
    this.repoPath = options.repoPath || process.cwd();
    this.debug = options.debug || false;
    this.gitPath = options.gitPath || 'git';
    this.env = { ...process.env };

    if (!this.repoPath) {
      throw new Error('Repo path is required');
    }
  }

  log(message, data = null) {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] GitInterface: ${message}`);
      if (data) console.log(data);
    }
  }

  async execute(args, options = {}) {
    const execOptions = {
      cwd: options.cwd || this.repoPath,
      env: { ...this.env, ...(options.env || {}) },
      timeout: options.timeout || 60000
    };

    this.log(`Executing: ${this.gitPath} ${args.join(' ')}`, execOptions);

    return new Promise((resolve, reject) => {
      const cmd = spawn(this.gitPath, args, execOptions);

      let stdout = '';
      let stderr = '';

      cmd.stdout.on('data', data => stdout += data.toString());
      cmd.stderr.on('data', data => stderr += data.toString());
      cmd.on('error', error => {
        this.log('Error executing command:', error);
        reject(new Error(`Command execution failed: ${error.message}`));
      });

      cmd.on('close', exitCode => {
        this.log(`Command exited with code ${exitCode}`);
        this.log('stdout:', stdout);
        this.log('stderr:', stderr);

        if (options.failOnError && exitCode !== 0) {
          reject(new Error(`Git command failed with code ${exitCode}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      })
    });
  }

  async init(bare = false) {
    const args = ['init'];
    if (bare) args.push('--bare');

    await fs.mkdir(this.repoPath, { recursive: true });
    return this.execute(args, { failOnError: true });
  }

  async isRepository() {
    try {
      await this.execute(['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch (error) {
      this.log('Not a git repository:', error);
      return false;
    }
  }

  async clone(url, options = {}) {
    const args = ['clone'];

    if (options.branch) args.push('--branch', options.branch);
    if (options.depth) args.push('--depth', options.depth);
    if (options.recursive) args.push('--recursive');
    if (options.shallow) args.push('--shallow-submodules');

    args.push(url, this.repoPath);

    return this.execute(args, { cwd: path.dirname(this.repoPath)});
  }

  async status(options = {}) {
    const args = ['status'];

    if (options.short) args.push('--short');
    if (options.branch) args.push('--branch');
    if (options.porcelain) args.push('--porcelain');

    return this.execute(args);
  }

  async add(files) {
    const args = ['add'];

    if (Array.isArray(files)) {
      args.push(...files);
    } else {
      args.push(files);
    }

    return this.execute(args);
  }

  async commit(message, options = {}) {
    if (!message.trim()) {
      const { stdout } = await this.execute(['status', '--porcelain']);
      
      const changedFiles = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.substring(3).trim());
      
      // Generate automatic commit message
      if (changedFiles.length > 0) {
        const fileList = changedFiles.length <= 3 
          ? changedFiles.join(', ')
          : `${changedFiles.slice(0, 3).join(', ')} and ${changedFiles.length - 3} more files`;
        
        message = `Update ${fileList}`;
      } else {
        message = "Empty commit";
      }
      
      this.log(`Generated automatic commit message: ${message}`);
    }

    if (typeof message !== 'string') {
      throw new TypeError('Commit message must be a string');
    }

    const args = ['commit', '-m', message];

    if (options.all) args.push('--all');
    if (options.amend) args.push('--amend');
    if (options.author) args.push('--author', options.author);
    if (options.date) args.push('--date', options.date);

    return this.execute(args);
  }

  async createBranch(name, options = {}) {
    const args = ['branch']

    if (options.force) args.push('--force');

    args.push(name);

    if (options.startPoint) args.push(options.startPoint);

    return this.execute(args);
  }

  async checkout(branchName, options ={}) {
    const args = ['checkout'];

    if (options.force) args.push('--force');
    if (options.createBranch) args.push('-b');

    args.push(branchName);
    return this.execute(args);
  }

  async pull(remote = 'origin', branch = 'main', options = {}) {
    const args = ['pull'];
    
    if (options.rebase) args.push('--rebase');
    if (options.noFf) args.push('--no-ff');

    args.push(remote, branch);
    return this.execute(args);
  }

  async push(remote = 'origin', branch = 'main', options = {}) {
    const args = ['push'];

    if (options.force) args.push('--force');
    if (options.tags) args.push('--tags');

    args.push(remote, branch);
    return this.execute(args);
  }

  async log(options = {}) {
    const args = ['log'];

    if (options.maxCount) args.push(`-n${options.maxCount}`);
    if (options.oneline) args.push('--oneline');
    if (options.format) args.push(`--format=${options.format}`);
    if (options.graph) args.push('--graph');

    return this.execute(args);
  }

  async getCommits(format = '%H%n%an%n%ae%n%at%n%s%n%b%n<END>', maxCount = 10) {
    const { stdout } = await this.log({ format, maxCount });

    const commits = [];
    const commitTexts = stdout.split('<END>\n').filter(Boolean);

    for (const commitText of commitTexts) {
      const lines = commitText.split('\n');
      const commit = {
        hash: lines[0],
        author: lines[1],
        email: lines[2],
        date: new Date(parseInt(lines[3], 10) * 1000),
        subject: lines[4],
        body: lines.slice(5).join('\n').trim()
      }

      commits.push(commit);
    }

    return commits;
  }

  async getCurrentBranch() {
    const { stdout } = await this.execute(['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }

  async getBranches() {
    const args = ['branch'];
    
    const { stdout } = await this.execute(args);
    return stdout
      .split('\n')
      .map(branch => branch.trim().replace(/^\*\s+ /, ''))
      .filter(Boolean)
  }

  async getRemotes() {
    const { stdout } = await this.execute(['remote', '-v']);
    const remotes = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/(\S+)\s+(\S+)\s+\((\S+)\)/);
      if (match) {
        const remote = {
          name: match[1],
          url: match[2],
          type: match[3]
        };
        remotes.push(remote);
      }
    }
  }

  async fetch(remote = 'origin', options = {}) {
    const args = ['fetch'];

    if (options.prune) args.push('--prune');
    if (options.all) args.push('--all');

    args.push(remote);

    return this.execute(args);
  }

  async merge(branch, options = {}) {
    const args = ['merge'];

    if (options.noFf) args.push('--no-ff');
    if (options.squash) args.push('--squash');

    args.push(branch);

    return this.execute(args);
  }

  async tag(name, message) {
    return this.execute(['tag', '-a', name, '-m', message]);
  }

  async show(revisionRange) {
    return this.execute(['show', revisionRange]);
  }

  async reset(mode, commit = 'HEAD') {
    const args = ['reset'];

    if (mode === 'soft') args.push('--soft');
    else if (mode === 'mixed') args.push('--mixed');
    else if (mode === 'hard') args.push('--hard');

    args.push(commit);

    return this.execute(args);
  }

  async revert(commit) {
    return this.execute(['revert', commit]);
  }

  async stash(message) {
    const args = ['stash'];

    if (message) args.push('push', '-m', message);

    return this.execute(args);
  }

  async applyStash(stash = 'stash@{0}') {
    const args = ['stash', 'apply', stash];

    return this.execute(args);
  }

  async dropStash(stash = 'stash@{0}') {
    const args = ['stash', 'drop', stash];

    return this.execute(args);
  }

  async listStashes() {
    const { stdout }  = await this.execute(['stash', 'list']);
    const stashes = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      const match = line.match(/(stash@\{\d+\}): (.+)/);
      if (match) {
        const stash = {
          index: parseInt(match[1], 10),
          description: match[2],
          refence: `stash@{${match[1]}}`
        };

        stashes.push(stash);
      }
    }

    return stashes;
  }

  async getConfig(name) {
    try {
      const { stdout } = await this.execute(['config', '--get', name]);
      return stdout.trim();
    } catch (error) {
      if (error.message.includes('not found')) {
        return null;
      } else {
        throw error;
      }
    }
  }

  async setConfig(name, value, global = false) {
    const args = ['config'];

    if (global) args.push('--global');

    args.push(name, value);

    return this.execute(args);
  }

  async addRemote(name, url) {
    const args = ['remote', 'add', name, url];

    return this.execute(args);
  }

  async removeRemote(name) {
    const args = ['remote', 'remove', name];

    return this.execute(args);
  }

  async commitExists(hash) {
    try {
      await this.execute(['cat-file', '-e', `${commitHash}^{commit}`]);
      return true;
    } catch (error) {
      if (error.message.includes('not found')) {
        return false;
      } else {
        throw error;
      }
    }
  }

  async getCommitMessage(hash) {
    const { stdout } = await this.execute(['log', '-1', '--pretty=format:%s', hash]);
    return stdout.trim();
  }

  async cherryPick(hash) {
    const args = ['cherry-pick', hash];

    return this.execute(args);
  }

  async getChanges() {
    const { stdout } = await this.status({ parcelain: true });
    const changes = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);

      let status;
      if (statusCode === '??') status = 'untracked';
      else if (statusCode === 'M') status = 'modified';
      else if (statusCode === 'A') status = 'added';
      else if (statusCode === 'D') status = 'deleted';
      else if (statusCode === 'R') status = 'renamed';
      else if (statusCode === 'C') status = 'copied';
      else if (statusCode === 'U') status = 'unmerged';
      else status = 'unknown';

      changes.push({ status, path: filePath });
    }

    return changes;
  }

  async getFileContent(filePath, commitHash = 'HEAD') {
    try {
      const { stdout } = await this.execute(['show', `${commitHash}:${filePath}`]);
      return stdout;
    } catch (error) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async getRepoRoot() {
    const { stdout } = await this.execute(['rev-parse', '--show-toplevel']);
    return stdout.trim();
  }

  async blame(filePath) {
    const args = ['blame', filePath];

    return this.execute(args);
  }

  async isWorkingDirectoryClean() {
    const { stdout } = await this.status({ porcelain: true });
    return stdout.trim() === '';
  }

  async getUntrackedFiles() {
    const { stdout } = await this.execute(['ls-files', '--others', '--exclude-standard']);
    return stdout.split('\n').filter(Boolean);
  }

  async getConflictedFiles() {
    const { stdout } = await this.execute(['diff', '--name-only', '--diff-filter=U']);
    return stdout.split('\n').filter(Boolean);
  }

  async getLastCommitHash() {
    const { stdout } = await this.execute(['rev-parse', 'HEAD']);
    return stdout.trim();
  }

  async getVersion() {
    const { stdout } = await this.execute(['--version']);
    const match = stdout.match(/git version (\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    } else {
      return stdout.trim();
    }
  }

  async addWorktree(path, branch) {
    return this.execute(['worktree', 'add', path, branch]);
  }

  async removeWorktree(path) {
    return this.execute(['worktree', 'remove', path]);
  }

  async listWorktrees() {
    const { stdout } = await this.execute(['worktree', 'list']);
    const worktrees = [];
    const worktreeTexts = stdout.split('\n').filter(Boolean);

    for (const worktreeText of worktreeTexts) {
      const lines = worktreeText.split('\n');
      const worktree = {};

      for (const line of lines) {
        const [key, value] = line.split(' ');
        worktree[key] = value;
      }

      worktrees.push(worktree);
    }

    return worktrees;
  }
}

module.exports = GitInterface;