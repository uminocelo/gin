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
      console.log(message, data);
    }
  }
}

module.exports = GitInterface;