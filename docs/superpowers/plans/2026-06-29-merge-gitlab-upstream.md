# Merge GitLab Upstream → GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch latest commits from the original GitLab repo (`https://gitlab.com/abdulkhafit/whatdesks.git`), merge them into the local repo (preserving all GitHub commits), and push the merged result to GitHub (`https://github.com/WekaF/Whatsdesk-guzz.git`).

**Architecture:** Add GitLab as a second remote (`gitlab`). Fetch its default branch. Merge into local `main` using `--no-ff` to keep both histories. Resolve any conflicts favouring the GitLab changes for files they own and local changes for files added in GitHub-only commits. Push merged `main` to `origin` (GitHub).

**Tech Stack:** Git (merge strategy), GitHub remote (`origin`), GitLab remote (`gitlab`).

---

## Current State

| Thing | Value |
|-------|-------|
| Local branch | `main` |
| GitHub remote (`origin`) | `https://github.com/WekaF/Whatsdesk-guzz.git` |
| Latest GitHub commit | `7586cef` feat: WA auto-reconnect Telegram notify + REST QR endpoint |
| Uncommitted changes | `docker-compose.yml` (postgres service added), `frontend/package-lock.json` |
| Untracked | `backend/test.o`, `docs/` (plans) |

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `.gitignore` | Possibly modify | Add `backend/*.o` if not already ignored |
| `docker-compose.yml` | Keep local additions | Postgres service added for local dev — must survive merge |
| `docs/` | Add to git | Plans directory, commit before merge |
| `backend/test.o` | Ignore, do NOT commit | Compiled artifact |

---

### Task 1: Commit pending local changes

**Files:**
- Modify: `docker-compose.yml` (already changed — just commit)
- Modify: `frontend/package-lock.json` (already changed — just commit)
- Create commit: `docs/` directory

- [ ] **Step 1: Check .gitignore for *.o**

```bash
grep -n '\.o$\|\.o ' backend/.gitignore .gitignore 2>/dev/null || echo "not ignored"
```

If `*.o` is not present, add it:

```bash
echo "*.o" >> backend/.gitignore
```

Commit the .gitignore change:

```bash
git add backend/.gitignore
git commit -m "chore: ignore compiled .o artifacts"
```

- [ ] **Step 2: Commit docker-compose.yml changes**

The current change adds a `postgres` service to `docker-compose.yml` for local development. Commit it:

```bash
git add docker-compose.yml
git commit -m "chore(dev): add postgres service to docker-compose for local dev"
```

- [ ] **Step 3: Commit package-lock.json**

```bash
git add frontend/package-lock.json
git commit -m "chore(frontend): update package-lock.json"
```

- [ ] **Step 4: Commit docs directory**

```bash
git add docs/
git commit -m "docs: add implementation plans"
```

- [ ] **Step 5: Verify clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

### Task 2: Add GitLab as upstream remote and fetch

- [ ] **Step 1: Add GitLab remote**

```bash
git remote add gitlab https://gitlab.com/abdulkhafit/whatdesks.git
```

Verify:

```bash
git remote -v
```

Expected output includes:
```
gitlab  https://gitlab.com/abdulkhafit/whatdesks.git (fetch)
gitlab  https://gitlab.com/abdulkhafit/whatdesks.git (push)
origin  https://github.com/WekaF/Whatsdesk-guzz.git (fetch)
origin  https://github.com/WekaF/Whatsdesk-guzz.git (push)
```

- [ ] **Step 2: Fetch GitLab (all branches, no merge)**

```bash
git fetch gitlab
```

Expected: downloads GitLab objects/refs. Note the default branch name from output (likely `main` or `master`).

- [ ] **Step 3: Check GitLab commit log**

```bash
git log --oneline gitlab/main | head -15
```

(If GitLab uses `master`, substitute `gitlab/master` throughout the rest of this plan.)

This shows what new commits GitLab has that we don't.

- [ ] **Step 4: Find the common ancestor**

```bash
git merge-base HEAD gitlab/main
```

Note the SHA — this is the commit where the two histories diverged. Any GitLab commit AFTER this SHA is new content to merge.

---

### Task 3: Merge GitLab changes into local main

> **Important:** This merge keeps ALL existing local commits. Only GitLab commits that diverged after the common ancestor are brought in.

- [ ] **Step 1: Merge GitLab main into local main**

```bash
git merge gitlab/main --no-ff -m "merge: pull upstream GitLab changes into main"
```

If histories are completely unrelated (no common ancestor), add `--allow-unrelated-histories`:

```bash
git merge gitlab/main --no-ff --allow-unrelated-histories -m "merge: pull upstream GitLab (unrelated history)"
```

- [ ] **Step 2: Handle conflicts if any**

If `git merge` reports conflicts, Git will list the conflicting files. For each conflict:

```bash
git diff --name-only --diff-filter=U
```

For each conflicted file, open it and resolve:
- Lines between `<<<<<<< HEAD` and `=======` → our local version
- Lines between `=======` and `>>>>>>> gitlab/main` → GitLab version

**Strategy by file type:**

| File pattern | Keep which version |
|---|---|
| `backend/go.mod`, `go.sum` | Take BOTH — merge the require blocks manually |
| `docker-compose.yml` | Keep local version (has postgres service GitLab doesn't have) |
| Any backend `.go` file | Take GitLab version as base, re-apply any local additions on top |
| `frontend/src/**` | Take GitLab version as base, re-apply any local additions on top |
| `frontend/package-lock.json` | Accept local version (`git checkout --ours`) |

After resolving each file:

```bash
git add <resolved-file>
```

- [ ] **Step 3: Complete the merge**

After all conflicts resolved and staged:

```bash
git merge --continue
```

Or if `--continue` is not available:

```bash
git commit
```

- [ ] **Step 4: Verify history looks correct**

```bash
git log --oneline --graph -15
```

Expected: both GitLab commits AND local GitHub commits visible, connected by a merge commit at the top.

---

### Task 4: Verify the build still works

- [ ] **Step 1: Check Go backend compiles**

```bash
cd backend && go build ./... 2>&1
```

Expected: no errors. If missing imports, run `go mod tidy` first.

- [ ] **Step 2: Run go mod tidy if needed**

```bash
cd backend && go mod tidy
git add go.mod go.sum
git commit -m "chore(go): tidy modules after upstream merge" --no-edit
```

Only commit if `go mod tidy` changed files.

- [ ] **Step 3: Check frontend dependencies**

```bash
cd frontend && npm install --legacy-peer-deps 2>&1 | tail -5
```

Expected: no errors.

---

### Task 5: Push merged main to GitHub

- [ ] **Step 1: Push to origin (GitHub)**

```bash
git push origin main
```

Expected:

```
To https://github.com/WekaF/Whatsdesk-guzz.git
   <old-sha>..<new-sha>  main -> main
```

- [ ] **Step 2: Verify on GitHub**

Open `https://github.com/WekaF/Whatsdesk-guzz` in browser. Confirm:
- Merge commit appears at top of commit history
- Recent local commits (e.g., `7586cef`) still present in history
- GitLab commits also present

- [ ] **Step 3: Optional — remove GitLab remote if no longer needed**

If you don't need to pull from GitLab again:

```bash
git remote remove gitlab
git push origin main
```

---

## Self-Review

**Spec coverage:**
- [x] Clone/fetch from GitLab → Task 2
- [x] Merge into current project → Task 3
- [x] Upload to GitHub → Task 5
- [x] Preserve recent local changes → Tasks 1 + 3 (merge strategy keeps both histories)

**Placeholder scan:** None found — all steps contain exact commands and expected output.

**Type consistency:** N/A — no code types, git-only plan.

**Edge cases documented:**
- Unrelated histories → `--allow-unrelated-histories` flag in Task 3 Step 1
- Conflict resolution strategy by file type in Task 3 Step 2
- `go mod tidy` after merge in Task 4
