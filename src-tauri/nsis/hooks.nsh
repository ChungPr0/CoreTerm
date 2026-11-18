!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\CoreTerm" "" "Open in CoreTerm"
  WriteRegStr HKCU "Software\Classes\Directory\shell\CoreTerm" "Icon" '"$INSTDIR\coreterm.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\CoreTerm\command" "" '"$INSTDIR\coreterm.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CoreTerm" "" "Open in CoreTerm"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CoreTerm" "Icon" '"$INSTDIR\coreterm.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CoreTerm\command" "" '"$INSTDIR\coreterm.exe" "%V"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\CoreTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\CoreTerm"
!macroend
