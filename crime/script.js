console.log("Hello Crime Data Prediction");

// Function to fetch and clean data from the Police API
async function getData(url) {
  const dataResponse = await fetch(url);
  const data = await dataResponse.json();
  const cleaned = data
    .map((item) => ({
      latitude: parseFloat(item.location.latitude),
      longitude: parseFloat(item.location.longitude),
      outcome: item.outcome_status ? 1 : 0, // Label for crime resolution (1 if resolved, 0 if unresolved)
    }))
    .filter((item) => item.latitude != null && item.longitude != null);

  return cleaned;
}

// Function to create a TensorFlow model
function createModel(inputUnits = 2, outputUnits = 1, hiddenLayers = 1) {
  const model = tf.sequential();

  // Input layer
  model.add(
    tf.layers.dense({ inputShape: [inputUnits], units: 10, useBias: true })
  );

  // Hidden layers
  for (let i = 0; i < hiddenLayers; i++) {
    model.add(tf.layers.dense({ units: 10, activation: "relu" }));
  }

  // Output layer
  model.add(tf.layers.dense({ units: outputUnits, useBias: true }));

  return model;
}

// Function to convert data to tensors and normalize it
function convertToTensor(data) {
  return tf.tidy(() => {
    tf.util.shuffle(data);

    const inputs = data.map((d) => [d.latitude, d.longitude]);
    const labels = data.map((d) => d.outcome);

    const inputTensor = tf.tensor2d(inputs, [inputs.length, 2]);
    const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

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

    return {
      inputs: normalizedInputs,
      labels: normalizedLabels,
      inputMax,
      inputMin,
      labelMax,
      labelMin,
    };
  });
}

// Updated trainModel with loss tracking and binary cross-entropy for binary outcomes
async function trainModel(model, inputs, labels, batchSize = 32, epochs = 100) {
  model.compile({
    optimizer: tf.train.adam(0.0005), // Adjusted learning rate
    loss: "binaryCrossentropy", // Use binary cross-entropy for binary outcomes
    metrics: ["accuracy"],
  });

  const history = await model.fit(inputs, labels, {
    batchSize,
    epochs,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(
          `Epoch ${epoch + 1} - Loss: ${logs.loss}, Accuracy: ${logs.acc}`
        );
      },
    },
  });

  return history;
}

function createModel(inputUnits = 2, outputUnits = 1, hiddenLayers = 4) {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [inputUnits],
      units: 128,
      activation: "relu",
      useBias: true,
    })
  );

  for (let i = 0; i < hiddenLayers; i++) {
    model.add(tf.layers.dense({ units: 128, activation: "relu" }));
  }

  model.add(
    tf.layers.dense({
      units: outputUnits,
      activation: "sigmoid",
      useBias: true,
    })
  ); // Sigmoid for binary output

  return model;
}

// Modified testModel function with enhanced grid generation and normalization consistency
function testModel(model, inputData, normalizationData) {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  const [xs, preds] = tf.tidy(() => {
    // Create a finer grid for latitude and longitude
    const latitudeRange = tf.linspace(
      inputMin.arraySync()[0],
      inputMax.arraySync()[0],
      20
    );
    const longitudeRange = tf.linspace(
      inputMin.arraySync()[1],
      inputMax.arraySync()[1],
      20
    );

    // Generate all combinations of lat-long pairs
    const latLongGrid = latitudeRange.arraySync().flatMap((lat) => {
      return longitudeRange.arraySync().map((long) => [lat, long]);
    });

    const latLongTensor = tf.tensor2d(latLongGrid, [latLongGrid.length, 2]);
    const predictions = model.predict(latLongTensor);

    // Unnormalize predictions to match original scale
    const unNormPreds = predictions.mul(labelMax.sub(labelMin)).add(labelMin);

    // Debug: Log prediction values for verification
    console.log(
      "Sample Predictions (Unnormalized):",
      unNormPreds.arraySync().slice(0, 10)
    );

    return [latLongGrid, unNormPreds.arraySync()];
  });

  // Convert predicted points to a usable format for visualization
  const predictedPoints = xs.map((coords, i) => ({
    x: coords[0],
    y: preds[i][0],
  }));

  const originalPoints = inputData.map((d) => ({
    x: d.latitude,
    y: d.outcome,
  }));

  // Separate plots for clarity
  tfvis.render.scatterplot(
    { name: "Original Data Scatter Plot" },
    { values: originalPoints },
    { xLabel: "Latitude", yLabel: "Outcome", height: 300 }
  );

  tfvis.render.scatterplot(
    { name: "Model Predicted Data Scatter Plot" },
    { values: predictedPoints },
    { xLabel: "Latitude", yLabel: "Predicted Outcome", height: 300 }
  );
}

// Run function remains the same, but with the modified createModel and testModel functions
async function run(dataUrl) {
  const data = await getData(dataUrl);
  const values = data.map((d) => ({ x: d.latitude, y: d.longitude }));

  tfvis.render.scatterplot(
    { name: "Crime Data Scatter Plot" },
    { values },
    { xLabel: "Latitude", yLabel: "Longitude", height: 300 }
  );

  const model = createModel(2, 1, 3); // Updated input and hidden layers
  tfvis.show.modelSummary({ name: "Model Summary" }, model);

  const tensorData = convertToTensor(data);
  const { inputs, labels } = tensorData;

  await trainModel(model, inputs, labels);
  console.log("Done Training");

  testModel(model, data, tensorData);
}

// Additional necessary functions (getData, convertToTensor, trainModel) should be included as before.

// Usage example
document.addEventListener("DOMContentLoaded", () => {
  run(
    "https://data.police.uk/api/crimes-at-location?lat=51.509865&lng=-0.118092"
  );
});
