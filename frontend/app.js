// Plan Line to Span demo frontend.
//
// This file's only job is to build request envelopes exactly as the
// interface contract defines them, POST the raw JSON to /api/dispatch, and
// display the response envelope unmodified. It performs no client-side
// validation, matching, or interpretation of formulas -- the contract
// surface owns all of that (DEC-2: the UI must add no behavior the contract
// does not define). Any error the utility returns is shown exactly as
// received, `ok: false` and all.

const CONTRACT_VERSION = 'plan-line-to-span/v1';

const DEFAULT_DIMENSION_FILE = {
  format: 'plan-line-to-span-dimensions/v1',
  dimensions: [
    {
      id: 'location', name: 'Location',
      values: [
        { key: '4', name: 'USA' },
        { key: '20', name: 'New York City', parentKey: '4' },
        { key: '21', name: 'Los Angeles', parentKey: '4' },
      ],
    },
    {
      id: 'department', name: 'Department',
      values: [
        { key: 'rnd', name: 'R&D' },
        { key: 'eng', name: 'Engineering' },
      ],
    },
  ],
};

const responseOutput = document.getElementById('response-output');
const initPayloadField = document.getElementById('init-payload');

initPayloadField.value = JSON.stringify(DEFAULT_DIMENSION_FILE, null, 2);

async function send(request) {
  try {
    const res = await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body = await res.json();
    responseOutput.textContent = JSON.stringify(body, null, 2);
  } catch (err) {
    responseOutput.textContent = `transport error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function parseJsonField(field) {
  return JSON.parse(field.value);
}

document.getElementById('init-submit').addEventListener('click', () => {
  send({
    contractVersion: CONTRACT_VERSION,
    operation: 'initialize',
    payload: parseJsonField(initPayloadField),
  });
});

document.getElementById('benefit-submit').addEventListener('click', () => {
  const operation = document.getElementById('benefit-operation').value;
  const span = parseJsonField(document.getElementById('benefit-span'));

  const payload = operation === 'deleteBenefit' || operation === 'queryBenefit'
    ? { span }
    : { span, formula: parseJsonField(document.getElementById('benefit-formula')) };

  send({ contractVersion: CONTRACT_VERSION, operation, payload });
});

document.getElementById('employee-submit').addEventListener('click', () => {
  const dimensions = parseJsonField(document.getElementById('employee-dimensions'));
  send({ contractVersion: CONTRACT_VERSION, operation: 'queryEmployee', payload: { dimensions } });
});
