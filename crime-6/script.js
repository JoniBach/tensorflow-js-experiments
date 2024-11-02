// Main process triggered by "Process Data" button click
document.getElementById("process-data").addEventListener("click", async () => {
  const fileInput = document.getElementById("file-upload");
  const apiKeyInput = document.getElementById("api-key").value.trim();

  // Ensure the API key and file are provided
  if (!apiKeyInput) {
    alert("Please enter your API key.");
    return;
  }
  if (fileInput.files.length === 0) {
    alert("Please select a zip file to upload.");
    return;
  }

  const file = fileInput.files[0];

  try {
    const data = await extractDataFromZip(file);
    const { trendData, months } = await preprocessAndTrain(data);

    if (trendData && trendData.length > 0) {
      await generateRecommendations(months, trendData, apiKeyInput);
    } else {
      console.warn("Trend data is insufficient to generate recommendations.");
      document.getElementById("recommendation-text").textContent =
        "Trend data is insufficient to generate recommendations.";
    }
  } catch (error) {
    console.error("Error processing data:", error);
    alert("An error occurred while processing the data.");
  }
});

async function generateRecommendations(months, trendData, apiKey) {
  if (!trendData || trendData.length === 0) {
    console.warn("No trend data available for recommendations.");
    document.getElementById("recommendation-text").innerHTML =
      "<p>No sufficient data to generate recommendations.</p>";
    return;
  }

  document.getElementById("recommendation-text").innerHTML =
    "<p>Generating recommendations, please wait...</p>";

  // Prepare summarized data for GPT: only the date and value pairs
  const actualDataSummary = months.map((month, index) => ({
    date: month,
    crimes: index < trendData.length ? trendData[index].predictedCrimes : null,
  }));

  const futureDataSummary = trendData.map((data) => ({
    date: data.month,
    crimes: data.predictedCrimes,
  }));
  console.log("Generating recommendations...", {
    actualDataSummary,
    futureDataSummary,
  });

  const structuredInput = `
   The following is a set of historical and predicted crime data points for analysis and recommendations:
    - **Historical Crime Data Points:** ${JSON.stringify(actualDataSummary)}
    - **Predicted Crime Data Points:** ${JSON.stringify(futureDataSummary)}

  Analyze the historical data and provide insights
  Analyze the predicted data and provide insights
  Explain the prediction basis, describe observed patterns, differences, and trends, and provide significant findings or potential reasons behind these patterns. 
  Additionally, provide actionable insights and recommendations for stakeholders based on this analysis.
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are an analytical assistant providing insights based on crime data trends.",
          },
          { role: "user", content: structuredInput },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const recommendationMarkdown = data.choices[0].message.content.trim();
    const recommendationHTML = marked.parse(recommendationMarkdown);
    document.getElementById("recommendation-text").innerHTML =
      recommendationHTML;
  } catch (error) {
    console.error("Error generating recommendations:", error);
    document.getElementById("recommendation-text").innerHTML =
      "<p>Error generating recommendations.</p>";
  }
}

// Function to extract data from the uploaded zip file
async function extractDataFromZip(file) {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);

  const data = [];

  for (const [fileName, fileData] of Object.entries(contents.files)) {
    if (fileName.endsWith("-street.csv")) {
      const csvContent = await fileData.async("string");
      const parsedData = Papa.parse(csvContent, { header: true }).data;
      data.push(...parsedData);
    }
  }

  return data;
}

// Function to preprocess data and train the model
async function preprocessAndTrain(data) {
  const cleanedData = data.filter(
    (record) => record["Month"] && record["Crime type"]
  );
  const crimeCounts = {};

  cleanedData.forEach((record) => {
    const month = record["Month"];
    if (!crimeCounts[month]) {
      crimeCounts[month] = 0;
    }
    crimeCounts[month]++;
  });

  const months = Object.keys(crimeCounts).sort();
  const counts = months.map((month) => crimeCounts[month]);
  const monthsAsNumbers = months.map((_, index) => index);

  const features = generateSeasonalFeatures(monthsAsNumbers);
  const trendData = await trainSimpleSeasonalModel(features, counts, months);
  return { trendData, months };
}

// Function to create seasonal features
function generateSeasonalFeatures(inputs) {
  return inputs.map((x) => {
    const month = x % 12;
    const sinMonth = Math.sin((2 * Math.PI * month) / 12);
    const cosMonth = Math.cos((2 * Math.PI * month) / 12);
    return [x, sinMonth, cosMonth];
  });
}

// Function to train a model with seasonal features only
async function trainSimpleSeasonalModel(features, labels, months) {
  const inputTensor = tf.tensor2d(features);
  const labelTensor = tf.tensor1d(labels);

  const inputMax = inputTensor.max();
  const inputMin = inputTensor.min();
  const labelMax = labelTensor.max();
  const labelMin = labelTensor.min();

  const normalizedInputs = inputTensor
    .sub(inputMin)
    .div(inputMax.sub(inputMin));
  const normalizedLabels = labelTensor
    .sub(labelMin)
    .div(labelMax.sub(labelMin));

  const model = tf.sequential();
  model.add(
    tf.layers.dense({ inputShape: [3], units: 10, activation: "relu" })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 1 }));

  model.compile({ optimizer: tf.train.adam(0.01), loss: "meanSquaredError" });

  await model.fit(normalizedInputs, normalizedLabels, {
    epochs: 500,
    callbacks: tfvis.show.fitCallbacks(
      { name: "Training Performance" },
      ["loss"],
      { height: 200, callbacks: ["onEpochEnd"] }
    ),
  });

  const trendData = await predictFutureWithSeasonality(
    model,
    features,
    labels,
    inputMax,
    inputMin,
    labelMax,
    labelMin,
    months
  );

  return trendData;
}

// Function to predict future crime data using the model with seasonal features
function predictFutureWithSeasonality(
  model,
  features,
  labels,
  inputMax,
  inputMin,
  labelMax,
  labelMin,
  months
) {
  const numMonthsToPredict = 24;
  const futureFeatures = [];
  const futureMonths = [];

  for (let i = 1; i <= numMonthsToPredict; i++) {
    const nextIndex = features.length + i;
    const month = nextIndex % 12;
    const sinMonth = Math.sin((2 * Math.PI * month) / 12);
    const cosMonth = Math.cos((2 * Math.PI * month) / 12);
    futureFeatures.push([nextIndex, sinMonth, cosMonth]);

    const lastMonthDate = new Date(months[months.length - 1] + "-01");
    lastMonthDate.setMonth(lastMonthDate.getMonth() + i);
    const futureMonth = lastMonthDate.toISOString().slice(0, 7);
    futureMonths.push(futureMonth);
  }

  const futureFeatureTensor = tf.tensor2d(futureFeatures);
  const normalizedFutureFeatures = futureFeatureTensor
    .sub(inputMin)
    .div(inputMax.sub(inputMin));

  const normalizedPredictions = model.predict(normalizedFutureFeatures);
  const unnormalizedPredictions = normalizedPredictions
    .mul(labelMax.sub(labelMin))
    .add(labelMin);

  const futurePredictions = Array.from(unnormalizedPredictions.dataSync());

  console.log("Future Predictions:", futurePredictions);

  const annotations = generatePointAnnotations(futurePredictions, futureMonths);
  visualizeResultsWithSeasonality(
    features,
    labels,
    futureFeatures,
    futurePredictions,
    months,
    futureMonths,
    annotations
  );
  const trendData = futureMonths.map((month, index) => ({
    month: month,
    predictedCrimes: futurePredictions[index],
  }));

  console.log("Future Predictions:", trendData);
  return trendData;
}

// Function to generate point annotations based on peaks and troughs
function generatePointAnnotations(predictions, months) {
  const annotations = [];
  for (let i = 1; i < predictions.length - 1; i++) {
    if (
      predictions[i] > predictions[i - 1] &&
      predictions[i] > predictions[i + 1]
    ) {
      annotations.push({
        type: "point",
        xValue: months[i],
        yValue: predictions[i],
        backgroundColor: "red",
        radius: 5,
        label: {
          enabled: true,
          content: `Peak: ${Math.round(predictions[i])}`,
          position: "top",
        },
      });
    } else if (
      predictions[i] < predictions[i - 1] &&
      predictions[i] < predictions[i + 1]
    ) {
      annotations.push({
        type: "point",
        xValue: months[i],
        yValue: predictions[i],
        backgroundColor: "blue",
        radius: 5,
        label: {
          enabled: true,
          content: `Trough: ${Math.round(predictions[i])}`,
          position: "bottom",
        },
      });
    }
  }
  return annotations;
}

// Function to generate recommendations based on trend data and API key

// Visualization function with point annotations
function visualizeResultsWithSeasonality(
  features,
  labels,
  futureFeatures,
  futurePredictions,
  months,
  futureMonths,
  annotations
) {
  const chartLabels = months.concat(futureMonths);
  const actualData = labels;
  const predictedData = new Array(labels.length)
    .fill(null)
    .concat(futurePredictions);

  const datasetActual = {
    label: "Actual Crimes",
    data: actualData,
    backgroundColor: "rgba(54, 162, 235, 0.5)",
    borderColor: "rgba(54, 162, 235, 1)",
    fill: false,
    tension: 0.1,
  };

  const datasetPredicted = {
    label: "Predicted Crimes",
    data: predictedData,
    backgroundColor: "rgba(255, 99, 132, 0.5)",
    borderColor: "rgba(255, 99, 132, 1)",
    fill: false,
    tension: 0.1,
  };

  console.log({ datasetActual, datasetPredicted, annotations });

  const existingChart = Chart.getChart("crimeChart");
  if (existingChart) existingChart.destroy();

  const ctx = document.getElementById("crimeChart");
  if (ctx) ctx.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "crimeChart";
  document.getElementById("visualization").appendChild(canvas);

  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels: chartLabels, datasets: [datasetActual, datasetPredicted] },
    options: {
      responsive: true,
      scales: {
        x: {
          type: "category",
          display: true,
          title: { display: true, text: "Months" },
        },
        y: {
          display: true,
          title: { display: true, text: "Number of Crimes" },
        },
      },
      plugins: {
        title: {
          display: true,
          text: "Crime Count Predictions with Point Annotations",
        },
        annotation: { annotations: annotations },
      },
    },
  });
}
