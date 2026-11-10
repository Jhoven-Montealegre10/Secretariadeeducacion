"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemClock = exports.CLOCK = void 0;
exports.CLOCK = Symbol('CLOCK');
exports.systemClock = { now: () => Date.now() };
//# sourceMappingURL=clock.js.map