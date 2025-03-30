const GitInterface = require('./src/git-interface');

async function main() {
    const git = new GitInterface();
    try {
        await git.init();
        console.log("Git repository initialized successfully.");
    } catch (error) {
        console.error("Error initializing Git repository:", error);
    }
}

main();