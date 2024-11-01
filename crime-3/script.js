// Main function to handle file upload, data processing, and model training
async function processFile() {
  const fileInput = document.getElementById("fileInput").files[0];
  if (!fileInput) {
    alert("Please upload a file!");
    return;
  }

  const jsZip = new JSZip();
  const zip = await jsZip.loadAsync(fileInput);
  const data = [];

  // Process each file in the zip
  for (const filename in zip.files) {
    if (filename.endsWith("-street.csv")) {
      const csvContent = await zip.files[filename].async("string");
      data.push(...parseCSV(csvContent));
    }
  }

  // Aggregate data by month and crime type
  const aggregatedData = aggregateData(data);
  displayData(aggregatedData);

  // Prepare data for TensorFlow.js model
  const preparedData = prepareDataForModel(aggregatedData);

  // Check if data is sufficient for training
  if (preparedData.sequences.length < 2) {
    alert("Not enough data to create sequences. Please provide more data.");
    return;
  }

  // Train model and make predictions
  const model = await createAndTrainModel(preparedData);
  const predictions = makePredictions(model, preparedData);
  displayPredictions(predictions);
}

// Parse CSV content into structured JSON format
function parseCSV(csvContent) {
  const rows = csvContent.split("\n").slice(1); // Remove header row

  return rows
    .map((row) => {
      const columns = row.split(",");

      // Ensure the row has at least the expected 12 columns
      if (columns.length < 12) return null;

      const [
        crimeID,
        month, // Column for the month in "YYYY-MM" format
        reportedBy,
        fallsWithin,
        longitude,
        latitude,
        location,
        lsoaCode,
        lsoaName,
        crimeType, // Column for the type of crime
        lastOutcome,
        context,
      ] = columns;

      // Return object with properly trimmed values for month and crimeType
      return {
        month: month ? month.trim() : null,
        crimeType: crimeType ? crimeType.trim() : null,
      };
    })
    .filter((row) => row && row.month && row.crimeType); // Filter out any null or incomplete rows
}

// Aggregate parsed data by month and crime type
function aggregateData(data) {
  const aggregatedData = {};
  data.forEach((item) => {
    const key = `${item.month}-${item.crimeType}`;
    aggregatedData[key] = (aggregatedData[key] || 0) + 1;
  });
  return Object.keys(aggregatedData).map((key) => {
    const [month, crimeType] = key.split("-");
    return { month, crimeType, count: aggregatedData[key] };
  });
}

// Prepare data for model training
function prepareDataForModel(data) {
  const sequenceLength = 12;
  const crimeTypes = [...new Set(data.map((d) => d.crimeType))];
  const monthlyData = {};

  // Initialize monthly data with crime counts
  data.forEach((item) => {
    monthlyData[item.month] = monthlyData[item.month] || {};
    monthlyData[item.month][item.crimeType] = item.count;
  });

  const sequences = [];
  const months = Object.keys(monthlyData).sort();

  // Create sequences of `sequenceLength` months each
  for (let i = 0; i <= months.length - sequenceLength; i++) {
    const sequence = [];

    for (let j = 0; j < sequenceLength; j++) {
      const monthData = months[i + j];
      const crimeCounts = crimeTypes.map(
        (type) => monthlyData[monthData][type] || 0
      );
      sequence.push(crimeCounts);
    }
    sequences.push(sequence);
  }

  return { sequences, crimeTypes };
}

// Create and train the model
async function createAndTrainModel(preparedData) {
  const model = tf.sequential();
  model.add(
    tf.layers.lstm({
      units: 50,
      returnSequences: true,
      inputShape: [12, preparedData.crimeTypes.length],
    })
  );
  model.add(tf.layers.lstm({ units: 50 }));
  model.add(tf.layers.dense({ units: preparedData.crimeTypes.length }));

  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  const xs = tf.tensor3d(preparedData.sequences.slice(0, -1), [
    preparedData.sequences.length - 1,
    12,
    preparedData.crimeTypes.length,
  ]);
  const ys = tf.tensor2d(preparedData.sequences.slice(1), [
    preparedData.sequences.length - 1,
    preparedData.crimeTypes.length,
  ]);

  // Set up training visualization with tfjs-vis
  const fitCallbacks = tfvis.show.fitCallbacks(
    document.getElementById("training-tab"),
    ["loss"],
    { height: 200, callbacks: ["onEpochEnd"] }
  );

  await model.fit(xs, ys, { epochs: 50, callbacks: fitCallbacks });

  return model;
}

// Predict future values
function makePredictions(model, preparedData) {
  const lastSequence = tf.tensor3d(
    [preparedData.sequences.slice(-12)],
    [1, 12, preparedData.crimeTypes.length]
  );
  const predictions = model.predict(lastSequence).arraySync()[0];
  return predictions.map((pred, i) => ({
    crimeType: preparedData.crimeTypes[i],
    prediction: pred,
  }));
}

// Display the raw data
function displayData(data) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML =
    "<h3>Uploaded Crime Data</h3><pre>" +
    JSON.stringify(data.slice(0, 10), null, 2) +
    "</pre>";

  // Display a bar chart with tfjs-vis
  const values = data.slice(0, 10).map((d) => ({ x: d.crimeType, y: d.count }));
  tfvis.render.barchart(document.getElementById("data-tab"), values, {
    xLabel: "Crime Type",
    yLabel: "Count",
  });
}

// Display predictions using tfjs-vis
function displayPredictions(predictions) {
  const resultDiv = document.getElementById("result");
  const predictionHtml = predictions
    .map((pred) => `<p>${pred.crimeType}: ${pred.prediction.toFixed(2)}</p>`)
    .join("");
  resultDiv.innerHTML += "<h3>Crime Predictions</h3>" + predictionHtml;

  // Render predictions as a bar chart with tfjs-vis
  const values = predictions.map((d) => ({ x: d.crimeType, y: d.prediction }));
  tfvis.render.barchart(document.getElementById("predictions-tab"), values, {
    xLabel: "Crime Type",
    yLabel: "Predicted Count",
  });
}
