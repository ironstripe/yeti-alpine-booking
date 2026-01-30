

# Fix: TestInstructorLogin Import Error

## Issue
The error `ReferenceError: TestInstructorLogin is not defined` is occurring even though:
- The import exists at line 74: `import TestInstructorLogin from "./pages/TestInstructorLogin";`
- The file `src/pages/TestInstructorLogin.tsx` exists

This is a **hot-reload cache issue** where Vite's module bundler got out of sync.

## Solution
Make a trivial edit to `App.tsx` to trigger a clean rebuild - simply remove the extra blank line after the import (line 75-76 have two blank lines, reduce to one).

## File to Modify
- `src/App.tsx` - Clean up extra newline to trigger rebuild

