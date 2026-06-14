function run(input, parameters) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  if (!input || input.length < 1) {
    throw new Error("No input received from the model.");
  }

  let decisions = parseInput(input[0]);
  if (!decisions) {
    return "No actions to perform.";
  }
  if (!Array.isArray(decisions)) {
    decisions = [decisions];
  }

  const results = [];

  for (let i = 0; i < decisions.length; i++) {
    let folder = decisions[i];
    
    // Forgiving property lookup for folderPath
    let folderPath = folder.folderPath || folder.folderpath || folder.folder_path || folder.path || folder.folder;
    if (!folderPath) {
      throw new Error("Missing folderPath. Available keys: " + Object.keys(folder).join(", ") + " | Raw JSON: " + JSON.stringify(folder));
    }
    
    folderPath = String(folderPath);

    // Automatically restore tildes if Apple Intelligence stripped them
    if (folderPath.indexOf("comappleCloudDocs") !== -1) {
      folderPath = folderPath.replace("comappleCloudDocs", "com~apple~CloudDocs");
    }

    // Strip trailing carriage returns and newlines
    folderPath = folderPath.replace(/[\r\n]+$/, "");
    if (folderPath !== "/") {
      folderPath = folderPath.replace(/\/+$/, "");
    }

    const color = requireString(folder.color, "color").toLowerCase();
    
    // Normalize sfsymbol or sf symbol to symbol
    let iconType = requireString(folder.iconType, "iconType").toLowerCase();
    if (iconType.indexOf("symbol") !== -1 || iconType.indexOf("sym") !== -1) {
      iconType = "symbol";
    }
    const icon = requireString(folder.icon, "icon");

    // Check if the path exists, or if a trailing-space version exists
    let resolvedPath = folderPath;
    let exists = false;
    try {
      app.doShellScript("/bin/test -d " + shellQuote(resolvedPath));
      exists = true;
    } catch (e) {
      try {
        app.doShellScript("/bin/test -d " + shellQuote(resolvedPath + " "));
        resolvedPath = resolvedPath + " ";
        exists = true;
      } catch (err) {}
    }

    if (!exists) {
      results.push("Folder not found: " + folderPath);
      continue;
    }

    // Apply color and icon
    try {
      setFinderLabel(resolvedPath, labelIndexForColor(color));
    } catch (e) {}

    try {
      applyNativeFolderColor(app, color, resolvedPath);
      applyNativeFolderIcon(app, iconType, icon, resolvedPath);
      results.push("Updated: " + resolvedPath);
    } catch (err) {
      results.push("Failed to apply to: " + resolvedPath + " (" + err.message + ")");
    }
  }

  return results.join("\n");
}

function parseInput(value) {
  // Safe parsing that converts Cocoa NSStrings and arrays correctly to standard JS
  const str = String(value);
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return null;
    }
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

function labelIndexForColor(color) {
  const labels = {
    "default": 0, "none": 0, "blue": 0,
    "orange": 1, "red": 2, "yellow": 3,
    "purple": 5, "green": 6, "gray": 7, "grey": 7
  };
  return color in labels ? labels[color] : 0;
}

function nativeColorTagForColor(color) {
  const tags = {
    "default": "", "none": "", "blue": "",
    "orange": "Orange\n7", "red": "Red\n6", "yellow": "Yellow\n5",
    "purple": "Purple\n3", "green": "Green\n2", "gray": "Gray\n1", "grey": "Gray\n1"
  };
  return color in tags ? tags[color] : "";
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
  try {
    app.doShellScript(
      "/usr/bin/osascript -e " + shellQuote(script) + " " + shellQuote(folderPath) + " " + shellQuote(String(labelIndex))
    );
  } catch (e) {}
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
