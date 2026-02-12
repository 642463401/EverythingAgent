; EverythingAgent Custom NSIS Installer Script
; This script adds a page to guide the user through installing Everything search engine

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Variables for the Everything installation page
Var EverythingCheckbox
Var EverythingInstall

; =============================================
; Custom page: Everything Installation
; =============================================

Function everythingPageCreate
  ; Check if Everything is already installed by looking for the service or registry
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Everything" "DisplayName"
  ${IfNot} ${Errors}
    ; Everything is already installed, skip this page
    Abort
  ${EndIf}

  ; Also check HKCU (user-level install)
  ClearErrors
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Everything" "DisplayName"
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Title
  ${NSD_CreateLabel} 0 0 100% 24u "EverythingAgent 需要 Everything 搜索引擎来提供超快文件搜索功能。"
  Pop $0

  ; Description
  ${NSD_CreateLabel} 0 30u 100% 36u "Everything 是一款免费的 Windows 文件搜索工具，可以在毫秒级速度内搜索您电脑上的所有文件。安装 Everything 后，EverythingAgent 将能为您提供闪电般的文件搜索体验。"
  Pop $0

  ; Checkbox - default checked
  ${NSD_CreateCheckbox} 0 76u 100% 16u "安装 Everything 搜索引擎 (推荐)"
  Pop $EverythingCheckbox
  ${NSD_Check} $EverythingCheckbox

  ; Note
  ${NSD_CreateLabel} 0 100u 100% 24u "注: Everything 将以静默模式安装。如果您已经安装了 Everything，可取消勾选。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function everythingPageLeave
  ${NSD_GetState} $EverythingCheckbox $EverythingInstall
FunctionEnd

; =============================================
; Hook: customInstall - runs after files are extracted
; =============================================

!macro customInstall
  ; Check the checkbox state from our custom page
  ${If} $EverythingInstall == ${BST_CHECKED}
    ; Run Everything installer silently
    DetailPrint "正在安装 Everything 搜索引擎..."
    SetDetailsPrint textonly

    ; The Everything installer is in the resources directory
    nsExec::ExecToLog '"$INSTDIR\resources\Everything-Setup.exe" /S'
    Pop $0

    ${If} $0 == 0
      DetailPrint "Everything 搜索引擎安装成功!"
    ${Else}
      ; Try alternative silent install flag
      nsExec::ExecToLog '"$INSTDIR\resources\Everything-Setup.exe" /install /S'
      Pop $0
      ${If} $0 == 0
        DetailPrint "Everything 搜索引擎安装成功!"
      ${Else}
        DetailPrint "Everything 安装返回代码: $0 (可能需要手动安装)"
        MessageBox MB_OK|MB_ICONINFORMATION "Everything 搜索引擎自动安装未成功。$\n$\n您可以稍后手动安装，安装包位于:$\n$INSTDIR\resources\Everything-Setup.exe" /SD IDOK
      ${EndIf}
    ${EndIf}

    SetDetailsPrint both
  ${EndIf}
!macroend

; =============================================
; Hook: customHeader - add the custom page
; =============================================

!macro customHeader
  ; Declare the custom page (appears after the directory selection page)
  Page custom everythingPageCreate everythingPageLeave
!macroend
