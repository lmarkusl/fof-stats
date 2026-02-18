const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const BASE = 'http://localhost:3000';

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

function fetchStatus(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}

// ============================================================
// API Integration Tests (require running server on port 3000)
// ============================================================
describe('API Endpoints', () => {

  it('GET / returns 200 (HTML page)', async () => {
    const status = await fetchStatus('/');
    assert.equal(status, 200);
  });

  it('GET /api/team returns team data with expected fields', async () => {
    const { status, body } = await fetchJSON('/api/team');
    assert.equal(status, 200);
    assert.equal(body.id, 240890);
    assert.equal(body.name, 'FreilaufendeOnlineFuzzies');
    assert.ok(typeof body.score === 'number');
    assert.ok(typeof body.wus === 'number');
    assert.ok(typeof body.rank === 'number');
    assert.ok(body.rank > 0);
    assert.ok(typeof body.founder === 'string');
  });

  it('GET /api/members returns array of member objects', async () => {
    const { status, body } = await fetchJSON('/api/members');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.length > 0, 'Should have at least one member');

    const member = body[0];
    assert.ok(typeof member.name === 'string');
    assert.ok(typeof member.score === 'number');
    assert.ok(typeof member.wus === 'number');
    assert.ok('id' in member);
  });

  it('GET /api/members returns objects, not array-of-arrays', async () => {
    const { body } = await fetchJSON('/api/members');
    assert.ok(!Array.isArray(body[0]), 'First element should not be an array (headers)');
    assert.ok(typeof body[0] === 'object');
    assert.ok('name' in body[0]);
  });

  it('GET /api/history/team returns array with expected fields', async () => {
    const { status, body } = await fetchJSON('/api/history/team?period=hourly&limit=10');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    if (body.length > 0) {
      const row = body[0];
      assert.ok('date' in row);
      assert.ok('score' in row);
      assert.ok('wus' in row);
      assert.ok('score_delta' in row);
      assert.ok('wus_delta' in row);
    }
  });

  it('GET /api/history/team supports all period values', async () => {
    for (const period of ['hourly', 'daily', 'weekly', 'monthly', 'yearly']) {
      const { status } = await fetchJSON(`/api/history/team?period=${period}&limit=5`);
      assert.equal(status, 200, `Period '${period}' should return 200`);
    }
  });

  it('GET /api/history/movers returns array', async () => {
    const { status, body } = await fetchJSON('/api/history/movers?days=7');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
    if (body.length > 0) {
      assert.ok('name' in body[0]);
      assert.ok('score_gained' in body[0]);
    }
  });

  it('GET /api/history/summary returns tracking info', async () => {
    const { status, body } = await fetchJSON('/api/history/summary');
    assert.equal(status, 200);
    assert.ok('team_snapshots' in body);
    assert.ok('unique_members_tracked' in body);
    assert.ok('total_member_snapshots' in body);
    assert.ok(typeof body.team_snapshots === 'number');
    assert.ok(body.team_snapshots >= 0);
  });

  it('GET /api/history/member/:name returns array', async () => {
    // First get a member name
    const { body: members } = await fetchJSON('/api/members');
    const name = members[0].name;

    const { status, body } = await fetchJSON(`/api/history/member/${encodeURIComponent(name)}?period=hourly&limit=5`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  });

  it('GET /css/style.css returns 200', async () => {
    const status = await fetchStatus('/css/style.css');
    assert.equal(status, 200);
  });

  it('GET /js/app.js returns 200', async () => {
    const status = await fetchStatus('/js/app.js');
    assert.equal(status, 200);
  });

  it('GET /js/charts.js returns 200', async () => {
    const status = await fetchStatus('/js/charts.js');
    assert.equal(status, 200);
  });

  it('GET /nonexistent returns 404', async () => {
    const status = await fetchStatus('/nonexistent.html');
    assert.equal(status, 404);
  });
});
