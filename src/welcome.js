// The welcome card (index.html: #welcome): whether a visit opens with it,
// and remembering that a viewer asked not to see it again.

// "What is RockLab?" goes here.
export const ABOUT = 'https://github.com/Studio-Gray-Lake/rocklab';

// Where the browser keeps "don't show this again" (this viewer's own: never
// in the settings).
export const WELCOME_STORE = 'rocklab.welcome';
const OFF = 'off';

// Whether this viewer asked not to see the card again. `store` gives the
// browser's storage; where there is none, or it's blocked (asking for it
// can itself fail), nobody has asked.
export function welcomeIsOff(store = () => localStorage) {
  try {
    return store().getItem(WELCOME_STORE) === OFF;
  } catch {
    return false;
  }
}

// "Don't show this again." True if the browser kept it; false where it
// keeps nothing, and the card shows again on the next visit.
export function turnWelcomeOff(store = () => localStorage) {
  try {
    store().setItem(WELCOME_STORE, OFF);
    return true;
  } catch {
    return false;
  }
}

// Whether a visit opens with the card: unless this viewer asked not to see
// it again.
export const showsWelcome = ({ store } = {}) => !welcomeIsOff(store);
