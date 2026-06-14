on adding folder items to this_folder after receiving added_items
	try
		do shell script "echo '--- Folder Action Triggered: '\"$(date)\" >> /tmp/folder_action.log"
		repeat with this_item in added_items
			set posixPath to POSIX path of this_item
			
			set isFolder to false
			try
				do shell script "/bin/test -d " & quoted form of posixPath
				set isFolder to true
			end try
			
			if isFolder then
				do shell script "echo 'Processing folder: " & posixPath & "' >> /tmp/folder_action.log"
				try
					set cmd to "shortcuts run 'MacOS folder' -i " & quoted form of posixPath
					do shell script cmd & " >> /tmp/folder_action.log 2>&1"
				on error errMsg number errNum
					do shell script "echo 'Error running shortcuts: " & errMsg & " (" & errNum & ")' >> /tmp/folder_action.log"
				end try
			else
				do shell script "echo 'Skipped (not a folder): " & posixPath & "' >> /tmp/folder_action.log"
			end if
		end repeat
	on error errMsg number errNum
		do shell script "echo 'Top level error: " & errMsg & " (" & errNum & ")' >> /tmp/folder_action.log"
	end try
end adding folder items to
