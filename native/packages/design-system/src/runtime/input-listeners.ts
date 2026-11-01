// Native: focus only ever moves through a hardware keyboard or D-pad, so a focus event is itself the keyboard signal.
export const installInputListeners = (): void => undefined;
export const focusImpliesKeyboard = true;
