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
}

module.exports = GitInterface;