function run(input, parameters) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  // Function to check if a folder already has custom tag or icon
  function isFolderStyled(folderPath) {
    let hasTag = false;
    let hasIcon = false;
    try {
      app.doShellScript("/usr/bin/xattr -p com.apple.metadata:_kMDItemUserTags " + shellQuote(folderPath));
      hasTag = true;
    } catch (e) {}
    try {
      app.doShellScript("/usr/bin/xattr -p com.apple.icon.folder#S " + shellQuote(folderPath));
      hasIcon = true;
    } catch (e) {}
    return hasTag || hasIcon;
  }

  // --- MODE 1: Automated Single-Folder Mode ---
  if (input && input.length >= 1 && String(input[0]).trim() !== "") {
    let folderPath = String(input[0]).trim();
    // Resolve path if it was trimmed
    let resolvedPath = folderPath;
    try {
      app.doShellScript("/bin/test -d " + shellQuote(resolvedPath));
    } catch (e) {
      try {
        app.doShellScript("/bin/test -d " + shellQuote(resolvedPath + " "));
        resolvedPath = resolvedPath + " ";
      } catch (err) {}
    }

    // If it already has custom style, skip styling it
    if (isFolderStyled(resolvedPath)) {
      return JSON.stringify([]);
    }

    const parts = resolvedPath.replace(/\/+$/, "").split("/");
    const name = parts[parts.length - 1];

    const singleFolder = [{
      folderName: name,
      folderPath: resolvedPath,
      hasCustomColor: false,
      currentIcon: "",
      currentIconType: "emoji"
    }];
    return JSON.stringify(singleFolder);
  }

  // --- MODE 2: Manual Batch Scan Mode ---
  const targets = ["/Users/sam", "/Users/sam/Library/Mobile Documents/com~apple~CloudDocs"];
  const folders = [];

  for (let t = 0; t < targets.length; t++) {
    const parent = targets[t];
    let listStr = "";
    try {
      listStr = app.doShellScript("find " + shellQuote(parent) + " -maxdepth 1 -mindepth 1 -type d ! -name '.*'");
    } catch (e) {
      continue;
    }

    const lines = listStr.split("\r");
    for (let i = 0; i < lines.length; i++) {
      let fullPath = lines[i].trim();
      if (fullPath === "") continue;

      const name = fullPath.substring(fullPath.lastIndexOf("/") + 1);
      const skipFolders = ["Library", "Desktop", "Documents", "Downloads", "Movies", "Music", "Pictures", "Public", "Applications", "Shortcuts"];
      if (skipFolders.indexOf(name) !== -1) continue;

      // Skip already styled folders
      if (isFolderStyled(fullPath)) continue;

      folders.push({
        folderName: name,
        folderPath: fullPath,
        hasCustomColor: false,
        currentIcon: "",
        currentIconType: "emoji"
      });
    }
  }

  return JSON.stringify(folders);
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
