"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("../support/harness");
let h;
(0, node_test_1.before)(async () => {
    h = await (0, harness_1.createHarness)();
});
(0, node_test_1.after)(async () => h?.close());
(0, node_test_1.describe)('arranque', () => {
    (0, node_test_1.test)('la aplicación responde y usa la cuenta limitada', async () => {
        const res = await h.agent().get('/health/ready');
        strict_1.default.equal(res.status, 200);
        strict_1.default.equal(await h.db.scalar('SELECT current_user'), 'semibague_app');
    });
    (0, node_test_1.test)('login completo de administrador', async () => {
        const admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
        const agent = await h.login(admin);
        const res = await h.call(agent, 'get', '/api/v1/usuarios');
        strict_1.default.equal(res.status, 200, JSON.stringify(res.body));
    });
});
//# sourceMappingURL=00-smoke.test.js.map