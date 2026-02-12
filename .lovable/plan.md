
# Fix: Add "Go to Detail" Button After AI Extraction

## Problem

After running the AI extraction in the test panel, the conversation is created in the database and extraction results are displayed, but there is no way to navigate to the conversation detail page. The created conversation's ID is used during extraction but never stored, so users are stuck in the dialog.

## Solution

1. **Store the created conversation ID** in component state after `createConversation()` returns.
2. **Add a "Zur Nachricht" (Go to Message) button** in the footer that appears after successful extraction, navigating to `/inbox/{conversationId}` and closing the dialog.

## Technical Details

### File: `src/components/inbox/AITestPanel.tsx`

- Add `useNavigate` from `react-router-dom`
- Add `const [createdConversationId, setCreatedConversationId] = useState<string | null>(null)`
- In `handleRunTest`, after creating conversation: `setCreatedConversationId(conversation.id)`
- In `handleReset`, clear: `setCreatedConversationId(null)`
- Add a new button in the footer (next to "Zurücksetzen") when `createdConversationId` is set:
  ```
  "Zur Nachricht" -> navigate(`/inbox/${createdConversationId}`), close dialog
  ```

| Change | Detail |
|--------|--------|
| New state | `createdConversationId` to track the created conversation |
| New import | `useNavigate` from react-router-dom, `ExternalLink` icon from lucide-react |
| Footer button | "Zur Nachricht" button appears after extraction, navigates to detail page |
| Reset cleanup | Clear `createdConversationId` on reset |
