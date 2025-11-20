# Ideas & Brainstorming

## Considerations for Production
- **Deployment**: Move from Lovable-only to a controlled GitHub-based deployment pipeline.
- **Testing**: Implement strict test cases that must pass before pushing to prod.

## Improvement Ideas
- **Mapping Logic**: Improve auto-mapping for fields like `opp owner id` -> `owner_name`.
- **State Management**: Ensure data (accounts/reps) updates immediately after import without requiring a page refresh.

## Future Features
- [ ] Advanced "What-If" Scenarios: Simulate changes before applying them.
- [ ] Historical Trend Analysis: View how territory balance has changed over time.
- [ ] Mobile View for Managers: specialized view for quick approvals on the go.
- [ ] Integration with Salesforce/HubSpot: Direct sync (currently using CSV/Supabase).

## UI/UX Improvements
- [ ] Drag-and-drop interface for manual account reassignment.
- [ ] Enhanced map visualization for geographic territories.
