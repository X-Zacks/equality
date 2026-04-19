$TEMP_BRANCH = "github-push-temp"
$REMOVE_PATHS = @("openspec",".vscode","docs","example","DESIGN_PHILOSOPHY.md","IDENTITY.md","OPENSPEC_RESEARCH.md","PHASE-A-VERIFICATION.md","INSTALL_SOLUTIONS.md","skill-parity-analysis.md","debug-request.json","README_CN.md","test-lsp-pipe.js","USER.md","USER.md.equality-bak","test-compile-error.ts.equality-bak","OpenClaw_.md","push-github.ps1")

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "master") { Write-Error "Not on master"; exit 1 }

git branch -D $TEMP_BRANCH 2>$null
git checkout -b $TEMP_BRANCH

$toRemove = $REMOVE_PATHS | Where-Object { Test-Path $_ }
if ($toRemove) {
    git rm -r --cached @($toRemove) 2>$null
    git commit -m "chore: remove docs for public github [skip ci]"
    Write-Host "Removed: $($toRemove -join ', ')"
}

git push github "${TEMP_BRANCH}:main" --force
git checkout master
git branch -D $TEMP_BRANCH 2>$null
Write-Host "Done."
