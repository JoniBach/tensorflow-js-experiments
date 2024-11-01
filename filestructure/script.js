async function printZipStructure(file) {
  const zip = new JSZip();
  const outputElement = document.getElementById("zipStructure");
  const loadingElement = document.getElementById("loadingText");

  loadingElement.textContent = "Loading ZIP file...";

  try {
    const content = await file.arrayBuffer();
    const loadedZip = await zip.loadAsync(content);
    loadingElement.textContent = "ZIP file loaded successfully.";

    const rootName = file.name.split(".").slice(0, -1).join(".");
    const rootStructure = await buildFileStructure(loadedZip, loadingElement);
    const asciiStructure = convertToAsciiTree(rootStructure, rootName);

    outputElement.textContent = asciiStructure;
    loadingElement.textContent = "Processing complete.";
  } catch (error) {
    handleError(error, outputElement, loadingElement);
  }
}

// Builds a nested structure representing folders and files
async function buildFileStructure(loadedZip, loadingElement) {
  const root = {};
  const fileSchemas = {};

  const totalFiles = Object.values(loadedZip.files).filter(
    (file) => !file.dir
  ).length;
  const startTime = Date.now();
  let fileCounter = 0;

  for (const [relativePath, fileEntry] of Object.entries(loadedZip.files)) {
    const pathArray = relativePath.split("/");
    addFileToStructure(root, pathArray, fileEntry);

    if (!fileEntry.dir) {
      fileCounter++;
      const estimatedTimeRemaining = estimateTimeRemaining(
        startTime,
        fileCounter,
        totalFiles
      );
      loadingElement.textContent = `${estimatedTimeRemaining} seconds remaining. Processing file ${fileCounter} of ${totalFiles}: ${fileEntry.name}`;
      fileSchemas[relativePath] = await generateFileSchema(fileEntry);
    }
  }

  return { root, fileSchemas };
}

// Adds files and folders to a nested structure recursively
function addFileToStructure(node, pathArray, fileEntry) {
  const [current, ...remainingPath] = pathArray;
  if (!remainingPath.length) {
    node[current] = fileEntry;
  } else {
    node[current] = node[current] || {};
    addFileToStructure(node[current], remainingPath, fileEntry);
  }
}

// Estimates time remaining
function estimateTimeRemaining(startTime, fileCounter, totalFiles) {
  const elapsedTime = (Date.now() - startTime) / 1000;
  const averageTimePerFile = elapsedTime / fileCounter;
  return Math.round((totalFiles - fileCounter) * averageTimePerFile);
}

// Generates an ASCII tree from the nested structure
function convertToAsciiTree({ root, fileSchemas }, rootName) {
  function buildAsciiTree(node, path = "", prefix = "") {
    let result = "";
    const entries = Object.entries(node);
    entries.forEach(([key, value], index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const newPrefix = prefix + (isLast ? "    " : "│   ");
      const fullPath = path ? `${path}/${key}` : key;
      const schema = fileSchemas[fullPath] || "";

      if (typeof value.async === "function") {
        // It's a file
        result += `${prefix}${connector}${key}\n`;
        const formattedSchema = formatSchema(newPrefix, schema);
        if (formattedSchema) {
          result += `${formattedSchema}\n`;
        }
      } else {
        // It's a directory
        result += `${prefix}${connector}${key}\n`;
        result += buildAsciiTree(value, fullPath, newPrefix);
      }
    });
    return result;
  }

  return `${rootName}\n${buildAsciiTree(root)}`;
}

// Formats schema into readable format
function formatSchema(prefix, schema) {
  return schema
    ? schema
        .split("\n")
        .map((line) => `${prefix}    ${line}`)
        .join("\n")
    : "";
}

// Generates a basic schema for a file based on its type
// Generates a basic schema for a file based on its type
async function generateFileSchema(file) {
  try {
    const content = await file.async("string");

    if (file.name.endsWith(".json")) return parseJsonSchema(content);
    if (file.name.endsWith(".csv")) return parseCsvSchema(content);
    if (file.name.endsWith(".txt"))
      return "Schema: Text file\nRows: Unknown\nColumns: Unknown";
    return "Schema: Unknown format\nRows: Unknown\nColumns: Unknown";
  } catch (error) {
    console.error(`Failed to read or parse file: ${file.name}`, error);
    return "Schema: Could not read file content\nRows: Unknown\nColumns: Unknown";
  }
}

function parseJsonSchema(content) {
  try {
    const jsonContent = JSON.parse(content);
    const keys = Object.keys(jsonContent).join(", ");
    const rowCount = Array.isArray(jsonContent) ? jsonContent.length : 1;
    const columnCount = rowCount
      ? Object.keys(jsonContent[0] || jsonContent).length
      : 0;

    return `Schema: JSON keys - ${keys}\nRows: ${rowCount}\nColumns: ${columnCount}`;
  } catch {
    return "Schema: Invalid JSON format\nRows: Unknown\nColumns: Unknown";
  }
}

function parseCsvSchema(content) {
  const lines = content.split("\n");
  const headers = lines[0].split(",").map((header) => header.trim());
  const rowCount = lines.length - 1; // Exclude header row
  const columnCount = headers.length;

  return `Schema: CSV columns - ${headers.join(
    ", "
  )}\nRows: ${rowCount}\nColumns: ${columnCount}`;
}

function handleError(error, outputElement, loadingElement) {
  outputElement.textContent = `An error occurred while processing the ZIP file: ${error.message}`;
  console.error("Error processing ZIP file:", error);
  loadingElement.textContent = "An error occurred.";
}

// Event listener for file input
document.getElementById("fileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) {
    document.getElementById("zipStructure").textContent = "";
    document.getElementById("loadingText").textContent = "";
    printZipStructure(file);
  } else {
    document.getElementById("zipStructure").textContent = "No file selected";
  }
});

// Copy to Clipboard functionality
document.getElementById("copyButton").addEventListener("click", () => {
  const zipStructureText = document.getElementById("zipStructure").textContent;
  navigator.clipboard
    .writeText(zipStructureText)
    .then(() => alert("Structure copied to clipboard!"))
    .catch((error) => console.error("Failed to copy structure:", error));
});
