# 📂 Beautiful Mac Folders (Not Boring Folder Icons)

Transform your plain blue macOS folders into a stunning, color-coded, and emoji-styled workspace automatically! 

This workflow uses **macOS Folder Actions** and a custom **Shortcuts automation** powered by local **Apple Intelligence** to automatically categorize, color, and assign expressive icons to your folders the moment you create them.

---

## 🎨 The Semantic Color System

| Color | Category | Examples |
| :--- | :--- | :--- |
| **Purple** 🟣 | **Developer Code, Repositories, Tech & AI** | `code`, `projects`, `MoshiPlayground`, `Claude Research`, `Uhcl` |
| **Green** 🟢 | **Finance, Receipts, Health & Legal** | `Whoop Receipts`, `Taxes`, `Invoices`, `Medical` |
| **Orange** 🟠 | **Creativity, Music, Video, Design & Media** | `Music Production`, `Assets`, `Video Projects`, `Photos` |
| **Red** 🔴 | **Critical Documents, IDs, Travel & Adventure** | `i130 Documents`, `SkyDiving`, `Passports`, `Boarding Passes` |
| **Yellow** 🟡 | **Temporary Storage, Inboxes & Organization** | `Downloads`, `Inbox`, `To Sort` |
| **Gray** ⚪ | **Backups, System Configs, Archives & Logs** | `Archive 2025`, `Config Files`, `.ssh`, `.gitconfig` |
| **Default** 🔵 | **Standard macOS folders** | Standard folders that don't fit specific categories |

---

## 🚀 Setup Guide

### 1. Download/Create the Shortcut
* **iCloud Shortcut Link:** https://www.icloud.com/shortcuts/6673e999319b4d6aaf61be0a5e6df2cb
* Alternatively, you can build a 3-step Shortcut named **`MacOS folder`** with the following steps:
  1. **Run JavaScript for Automation** with JXA Script 1 (Scanner) — *Right-click the blue `[Input]` variable and bind it to `Shortcut Input`.*
  2. **Use Cloud model** with the AI prompt.
  3. **Run JavaScript for Mac Automation** with JXA Script 2 (Applier).

### 2. Configure Folder Actions on your Mac
Open your terminal inside this repository and run the setup script:
```bash
chmod +x setup.sh
./setup.sh
```
This automatically compiles the Folder Action Applescript and installs it to:
`~/Library/Workflows/Applications/Folder Actions/AutoStyleFolder.scpt`

### 3. Attach Folder Actions to your Directories
1. Open Finder, navigate to your home folder (`/Users/sam`) or your iCloud Drive folder.
2. Right-click on the folder, and go to **Services** (or **Quick Actions**) -> **Folder Actions Setup...**.
3. Check **"Enable Folder Actions"**.
4. Click the **`+`** button under "Folders with Actions" to add your home folder (`sam`) and/or `iCloud Drive`.
5. Attach the `AutoStyleFolder` script to them.
6. Make sure the checkboxes for both the folder and the script are ticked **ON**.

---

## 💻 The JXA Script Sources

### Script 1: Scanner (Top of the Shortcut)
```javascript
// Copy the code from stay-productive/beautiful-mac-folders/jxa/scanner.js
```

### Script 2: Applier (Bottom of the Shortcut)
```javascript
// Copy the code from stay-productive/beautiful-mac-folders/jxa/applier.js
```

---

## 🛠 Troubleshooting & Manual Running

* **To style all existing folders at once:** Just click the **Play** button on the `MacOS folder` Shortcut inside the Shortcuts app. It will run in batch scan mode, find any un-styled folders, and style them all.
* **To check logs:** If something isn't styling, check the log file: `/tmp/folder_action.log`
* **To reset folders back to default:** Run the following command in terminal:
  ```bash
  for parent in "/Users/sam" "$HOME/Library/Mobile Documents/com~apple~CloudDocs"; do
    for dir in "$parent"/*; do
      if [[ -d "$dir" && "$dir" != "$HOME/Library" ]]; then
        xattr -d com.apple.metadata:_kMDItemUserTags "$dir" 2>/dev/null || true
        xattr -d com.apple.icon.folder#S "$dir" 2>/dev/null || true
        rm -f "$dir/Icon"$'\r' 2>/dev/null || true
        osascript -e "tell application \"Finder\" to set label index of (POSIX file \"$dir\" as alias) to 0" 2>/dev/null || true
      fi
    done
  done
  killall Finder
  ```
