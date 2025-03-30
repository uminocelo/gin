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
}

module.exports = GitInterface;