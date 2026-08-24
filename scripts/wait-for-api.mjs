const url = process.env.PVP_HEALTH_URL || "http://127.0.0.1:8000/api/health";
const deadline = Date.now() + 120_000;

process.stdout.write(`Waiting for API at ${url}\n`);

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      process.stdout.write("API is ready\n");
      process.exit(0);
    }
  } catch {
    // The API process is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`API did not become ready within 120 seconds: ${url}`);
process.exit(1);
