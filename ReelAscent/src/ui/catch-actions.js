// v7.1 compatibility shim. Catch disposition no longer happens at landing time:
// every successful catch is stored in Inventory immediately and managed from the I menu.
// This class remains exportable only so older cached/importing code fails harmlessly during rollout.
export class CatchActions {
  constructor() {
    document.body.classList.remove('catch-decision');
  }
  update() {}
  destroy() {
    document.body.classList.remove('catch-decision');
  }
}
