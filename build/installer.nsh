; EverythingAgent Custom NSIS Installer Script
; Everything portable version is bundled in resources/everything/
; No separate installation step is needed.

!include "MUI2.nsh"
!include "LogicLib.nsh"

; =============================================
; Hook: customInstall - runs after files are extracted
; =============================================

!macro customInstall
  ; Nothing to do - Everything portable is bundled in resources/everything/
  ; The app will auto-start Everything.exe when needed
  DetailPrint "Everything 便携版已包含在安装包中，无需额外安装。"
!macroend
