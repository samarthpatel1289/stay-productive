function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  if (!argv || argv.length < 1 || argv[0] === "--help" || argv[0] === "-h") {
    return [
      "Usage: osascript -l JavaScript set-folder-appearance.jxa.js '<json>'",
      "JSON: {\"folderPath\":\"/path/to/folder\",\"color\":\"orange\",\"iconType\":\"symbol\",\"icon\":\"airplane.circle.fill\"}"
    ].join("\n");
  }

  let data = parseInput(argv[0]);
  if (data && typeof data === "object") {
    if (Array.isArray(data) || "length" in data) {
      data = data[0];
    }
  }
  if (!data) {
    throw new Error("Invalid or empty input data.");
  }

  let folderPath = requireString(data.folderPath, "folderPath");
  folderPath = folderPath.replace(/[\r\n]+$/, "");
  if (folderPath !== "/") {
    folderPath = folderPath.replace(/\/+$/, "");
  }
  const color = requireString(data.color, "color").toLowerCase();
  let iconType = requireString(data.iconType, "iconType").toLowerCase();
  if (iconType.indexOf("symbol") !== -1 || iconType.indexOf("sym") !== -1) {
    iconType = "symbol";
  }
  const icon = requireString(data.icon, "icon");

  try {
    validateFolder(app, folderPath);
  } catch (err) {
    // If the path was trimmed of a trailing space by Shortcuts, try with a trailing space appended
    try {
      validateFolder(app, folderPath + " ");
      folderPath = folderPath + " ";
    } catch (e) {
      return "Skipped folder validation: " + folderPath + " (" + err.message + ")";
    }
  }

  try {
    validateIcon(iconType, icon);
  } catch (err) {
    return "Skipped icon validation: " + icon + " (" + err.message + ")";
  }

  try {
    setFinderLabel(folderPath, labelIndexForColor(color));
  } catch (err) {
    // Log/ignore Finder-specific automation restrictions (e.g. iCloud-synced Desktop/Documents folders)
  }

  try {
    applyNativeFolderColor(app, color, folderPath);
    applyNativeFolderIcon(app, iconType, icon, folderPath);
  } catch (err) {
    return "Failed to apply appearance to " + folderPath + " (" + err.message + ")";
  }

  return "Updated folder: " + folderPath + "/";
}

function parseInput(value) {
  if (typeof value === "object" && value !== null) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("Input must be valid JSON: " + error.message);
  }
}

function requireString(value, name) {
  if (value === undefined || value === null) {
    throw new Error("Missing field: " + name);
  }
  const str = String(value);
  if (str.length === 0) {
    throw new Error("Empty field: " + name);
  }
  return str;
}

function validateFolder(app, folderPath) {
  const quoted = shellQuote(folderPath);
  app.doShellScript("/bin/test -d " + quoted);
}

function validateIcon(iconType, icon) {
  if (iconType !== "symbol" && iconType !== "emoji") {
    throw new Error("iconType must be symbol or emoji.");
  }

  if (iconType === "symbol" && !/^[a-z0-9._-]+$/.test(icon)) {
    throw new Error("Invalid SF Symbol name: " + icon);
  }
}

function labelIndexForColor(color) {
  const labels = {
    "default": 0,
    "none": 0,
    "blue": 0,
    "orange": 1,
    "red": 2,
    "yellow": 3,
    "purple": 5,
    "green": 6,
    "gray": 7,
    "grey": 7
  };

  if (!(color in labels)) {
    throw new Error("Unsupported color: " + color);
  }

  return labels[color];
}

function nativeColorTagForColor(color) {
  const tags = {
    "default": "",
    "none": "",
    "blue": "",
    "orange": "Orange\n7",
    "red": "Red\n6",
    "yellow": "Yellow\n5",
    "purple": "Purple\n3",
    "green": "Green\n2",
    "gray": "Gray\n1",
    "grey": "Gray\n1"
  };

  if (!(color in tags)) {
    throw new Error("Unsupported color: " + color);
  }

  return tags[color];
}

function setFinderLabel(folderPath, labelIndex) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  const script = [
    "on run argv",
    "  set folderPath to item 1 of argv",
    "  set labelIndexValue to (item 2 of argv) as integer",
    "  tell application \"Finder\"",
    "    set label index of (POSIX file folderPath as alias) to labelIndexValue",
    "  end tell",
    "end run"
  ].join("\n");
  app.doShellScript(
    "/usr/bin/osascript " +
      shellQuote("-e") +
      " " +
      shellQuote(script) +
      " " +
      shellQuote(folderPath) +
      " " +
      shellQuote(String(labelIndex))
  );
}

function applyNativeFolderColor(app, color, folderPath) {
  const colorTag = nativeColorTagForColor(color);
  const script = [
    "set -euo pipefail",
    "color_tag=$1",
    "target_folder=${2%/}",
    "if [[ -z \"$color_tag\" ]]; then",
    "  /usr/bin/xattr -d 'com.apple.metadata:_kMDItemUserTags' \"$target_folder\" 2>/dev/null || true",
    "  exit 0",
    "fi",
    "/usr/bin/python3 -c '",
    "import plistlib",
    "import subprocess",
    "import sys",
    "tag = sys.argv[1]",
    "folder = sys.argv[2]",
    "data = plistlib.dumps([tag], fmt=plistlib.FMT_BINARY).hex()",
    "subprocess.run([\"xattr\", \"-wx\", \"com.apple.metadata:_kMDItemUserTags\", data, folder], check=True)",
    "' \"$color_tag\" \"$target_folder\""
  ].join("\n");

  runZsh(app, script, [colorTag, folderPath]);
}

function applyNativeFolderIcon(app, iconType, icon, folderPath) {
  const metadata = iconType === "symbol" ? { sym: icon } : { emoji: icon };
  const percentEncodedJson = encodeURIComponent(JSON.stringify(metadata));
  const script = [
    "set -euo pipefail",
    "encoded_json=$1",
    "target_folder=${2%/}",
    "target_icon=\"$target_folder/Icon\"$'\\r'",
    "if [[ -e \"$target_icon\" ]]; then",
    "  /bin/rm -f \"$target_icon\"",
    "fi",
    "/usr/bin/python3 -c '",
    "import urllib.parse",
    "import subprocess",
    "import sys",
    "encoded = sys.argv[1]",
    "folder = sys.argv[2]",
    "decoded_json = urllib.parse.unquote(encoded)",
    "subprocess.run([\"xattr\", \"-w\", \"com.apple.icon.folder#S\", decoded_json, folder], check=True)",
    "' \"$encoded_json\" \"$target_folder\""
  ].join("\n");

  runZsh(app, script, [percentEncodedJson, folderPath]);
}

function runZsh(app, script, args) {
  const command = ["/bin/zsh", "-c", script, "zsh"].concat(args);
  app.doShellScript(command.map(shellQuote).join(" "));
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
