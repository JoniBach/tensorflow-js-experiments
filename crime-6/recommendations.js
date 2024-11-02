async function generateRecommendations(trendData) {
  if (!trendData || trendData.length === 0) {
    console.warn("No trend data available for recommendations.");
    document.getElementById("recommendation-text").innerHTML =
      "<p>No sufficient data to generate recommendations.</p>";
    return;
  }

  const structuredInput = `Analyze the following crime trend data and suggest actions or recommendations: ${JSON.stringify(
    trendData
  )}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that provides crime trend recommendations.",
          },
          { role: "user", content: structuredInput },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });
    const data = await response.json();
    const recommendationMarkdown = data.choices[0].message.content.trim();

    // Convert markdown to HTML using marked.js
    const recommendationHTML = marked.parse(recommendationMarkdown);

    document.getElementById("recommendation-text").innerHTML =
      recommendationHTML;
  } catch (error) {
    console.error("Error generating recommendations:", error);
    document.getElementById("recommendation-text").innerHTML =
      "<p>Error generating recommendations.</p>";
  }
}
