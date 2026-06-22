export async function analyzeTaskWithAI(payload) {
  const response = await fetch("/.netlify/functions/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : "AI request failed.";
    throw new Error(message);
  }

  return data;
}
