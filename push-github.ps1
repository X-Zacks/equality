$TEMP_BRANCH = "github-push-temp"
$REMOVE_PATHS = @("openspec",".vscode","docs","example","DESIGN_PHILOSOPHY.md","IDENTITY.md","OPENSPEC_RESEARCH.md","PHASE-A-VERIFICATION.md","INSTALL_SOLUTIONS.md","skill-parity-analysis.md","debug-request.json","README_CN.md","test-lsp-pipe.js","USER.md","USER.md.equality-bak","test-compile-error.ts.equality-bak","OpenClaw_安全调研报告.md","push-github.ps1")

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "master") { Write-Error "Not on master"; exit 1 }

git branch -D $TEMP_BRANCH 2>$null
git checkout -b $TEMP_BRANCH

# 逐个删除，--ignore-unmatch 确保不在 index 的路径不会导致命令失败
foreach ($path in $REMOVE_PATHS) {
    git rm -r --cached --ignore-unmatch $path
}

# 检查是否有 staged 变更，防止空 commit 把原始内容推上去
$staged = git diff --cached --name-only
if ($staged) {
    git commit -m "chore: remove docs for public github [skip ci]"
    Write-Host "Removed from index successfully."
} else {
    Write-Error "ERROR: Nothing was staged for removal. Aborting to prevent pushing internal files."
    git checkout -f master
    git branch -D $TEMP_BRANCH 2>$null
    exit 1
}

git push github "${TEMP_BRANCH}:main" --force
git checkout -f master
git branch -D $TEMP_BRANCH 2>$null
Write-Host "Done."
