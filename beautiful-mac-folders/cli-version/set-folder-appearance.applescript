use scripting additions
on run argv
	if (count of argv) is 0 or item 1 of argv is "--help" or item 1 of argv is "-h" then
		return "Usage: osascript set-folder-appearance.applescript <color> <sf-symbol-or-emoji> [folder-path]" & linefeed & "If folder-path is omitted, the script uses the current Terminal directory." & linefeed & "Custom colors: orange, red, yellow, purple, green, gray" & linefeed & "Default color aliases: default, none, blue"
	end if
	
	if (count of argv) < 2 then error "Expected color and SF Symbol or emoji parameters. Run with --help for usage."
	
	set colorName to item 1 of argv
	set symbolName to item 2 of argv
	set folderPath to missing value
	if (count of argv) ≥ 3 then set folderPath to item 3 of argv
	
	set targetFolderAlias to my resolveTargetFolder(folderPath)
	set targetFolderPOSIX to POSIX path of targetFolderAlias
	set colorIndex to my labelIndexForColor(colorName)
	
	tell application "Finder"
		set label index of targetFolderAlias to colorIndex
	end tell
	
	my applyNativeFolderColor(colorName, targetFolderPOSIX)
	my applyNativeFolderIcon(symbolName, targetFolderPOSIX)
	
	return "Updated folder: " & targetFolderPOSIX
end run

on resolveTargetFolder(folderPath)
	if folderPath is not missing value then
		do shell script "/bin/test -d " & quoted form of folderPath
		set candidate to POSIX file folderPath as alias
		return candidate
	end if
	
	set currentDirectory to do shell script "/bin/pwd"
	do shell script "/bin/test -d " & quoted form of currentDirectory
	return POSIX file currentDirectory as alias
end resolveTargetFolder

on labelIndexForColor(colorName)
	set normalizedColor to my lowercaseText(colorName)
	if normalizedColor is "default" or normalizedColor is "none" or normalizedColor is "blue" then return 0
	if normalizedColor is "orange" then return 1
	if normalizedColor is "red" then return 2
	if normalizedColor is "yellow" then return 3
	if normalizedColor is "purple" then return 5
	if normalizedColor is "green" then return 6
	if normalizedColor is "gray" or normalizedColor is "grey" then return 7
	error "Unsupported color: " & colorName
end labelIndexForColor

on lowercaseText(sourceText)
	return do shell script "/usr/bin/python3 -c " & quoted form of "import sys; print(sys.argv[1].lower())" & " " & quoted form of sourceText
end lowercaseText

on nativeColorTagForColor(colorName)
	set normalizedColor to my lowercaseText(colorName)
	if normalizedColor is "default" or normalizedColor is "none" or normalizedColor is "blue" then return ""
	if normalizedColor is "orange" then return "Orange" & linefeed & "7"
	if normalizedColor is "red" then return "Red" & linefeed & "6"
	if normalizedColor is "yellow" then return "Yellow" & linefeed & "5"
	if normalizedColor is "purple" then return "Purple" & linefeed & "3"
	if normalizedColor is "green" then return "Green" & linefeed & "2"
	if normalizedColor is "gray" or normalizedColor is "grey" then return "Gray" & linefeed & "1"
	error "Unsupported color: " & colorName
end nativeColorTagForColor

on applyNativeFolderColor(colorName, folderPath)
	set colorTag to my nativeColorTagForColor(colorName)
	set shellScript to "
set -euo pipefail

color_tag=$1
target_folder=${2%/}

if [[ -z \"$color_tag\" ]]; then
  /usr/bin/xattr -d 'com.apple.metadata:_kMDItemUserTags' \"$target_folder\" 2>/dev/null || true
  exit 0
fi

/usr/bin/python3 -c '
import plistlib
import subprocess
import sys

tag = sys.argv[1]
folder = sys.argv[2]
data = plistlib.dumps([tag], fmt=plistlib.FMT_BINARY).hex()
subprocess.run([
    \"xattr\",
    \"-wx\",
    \"com.apple.metadata:_kMDItemUserTags\",
    data,
    folder,
], check=True)
' \"$color_tag\" \"$target_folder\"
"
	do shell script "/bin/zsh -c " & quoted form of shellScript & " zsh " & quoted form of colorTag & " " & quoted form of folderPath
end applyNativeFolderColor

on applyNativeFolderIcon(symbolName, folderPath)
	set shellScript to "
set -euo pipefail

icon_value=$1
target_folder=${2%/}
target_icon=\"$target_folder/Icon\"$'\\r'

if [[ -e \"$target_icon\" ]]; then
  /bin/rm -f \"$target_icon\"
fi

/usr/bin/SetFile -a c \"$target_folder\"

json_value=$(/usr/bin/python3 -c '
import json
import re
import sys

icon = sys.argv[1]
if re.fullmatch(r\"[a-z0-9._-]+\", icon):
    print(json.dumps({\"sym\": icon}, ensure_ascii=False, separators=(\",\", \":\")))
else:
    print(json.dumps({\"emoji\": icon}, ensure_ascii=False, separators=(\",\", \":\")))
' \"$icon_value\")

/usr/bin/xattr -w 'com.apple.icon.folder#S' \"$json_value\" \"$target_folder\"
"
	do shell script "/bin/zsh -c " & quoted form of shellScript & " zsh " & quoted form of symbolName & " " & quoted form of folderPath
end applyNativeFolderIcon
