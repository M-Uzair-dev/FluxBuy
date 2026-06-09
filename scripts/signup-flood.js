const TOTAL = 50;
const URL = 'http://localhost:5000/auth/signup';

async function signupUser(i) {
  const body = {
    name: `Test User ${i}`,
    email: `testuser${i}_${Date.now()}@mailinator.com`,
    password: 'password123',
  };

  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`[${i}] ${res.status} - ${data.success ? 'OK' : data.error}`);
  } catch (err) {
    console.error(`[${i}] FAILED - ${err.message}`);
  }
}

console.log(`Signing up ${TOTAL} users concurrently...`);
const start = Date.now();

await Promise.all(Array.from({ length: TOTAL }, (_, i) => signupUser(i + 1)));

console.log(`Done in ${Date.now() - start}ms`);
