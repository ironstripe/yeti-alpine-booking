const participant = { id: "local-1", first_name: "Alexandra-Maria", last_name: "von Beispielhausen-Winterberg", birth_date: null, skill_level: null, sport: "ski" };
export function useBookingWizard() { return { state: { customer: null, activeCartItemId: "item-1", localParticipants: [participant], selectedParticipants: [], conversationId: null }, setCustomer: () => {}, addCartItem: () => {}, removeCartItem: () => {}, setActiveCartItem: () => {}, getAllCartItems: () => [], addLocalParticipant: () => {} }; }
export type WizardStep = 1 | 2 | 3;
