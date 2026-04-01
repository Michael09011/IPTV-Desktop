# IPTV-Desktop App v0.1.3 - Cross Platform (Mac OS, Win OS, Linux)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://shields.io/)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-26.0.0-9feaf9.svg)](https://www.electronjs.org/)
[![MPV Support](https://img.shields.io/badge/mpv-player-important.svg)](https://mpv.io/)
[![Release](https://img.shields.io/badge/release-download-brightgreen.svg)](https://github.com/Michael09011/IPTV-Desktop/releases/tag/IPTV-Desktop)
[![Mobile App](https://img.shields.io/badge/Mobile%20App-View%20on%20GitHub-blue)](https://github.com/Michael09011/IPTV-Mobile-APP)

<img width="200" height="200" alt="IPTV-Desktop アプリアイコン" src="build/icon.png" />
<img width="1312" height="912" alt="スクリーンショット 2026-04-01 01 47 51" src="https://github.com/user-attachments/assets/d8b2f587-ba36-4f0e-9dbb-108817317797" />

ElectronベースのIPTVデスクトップアプリ（プレイリスト読み込み、チャンネル再生、MPV/VLCプレイヤーサポート、EPG、自動バックアップ、日本放送サポートなど）。

## 🏗️ 技術スタック

### 🖥️ Frontend
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Electron](https://img.shields.io/badge/Electron-191970?style=flat-square&logo=electron&logoColor=white)

- **Renderer Process**: HTML5 + CSS3 + Vanilla JavaScript
- **HLS.js**: HLS/M3U8ストリーム再生
- **Shaka Player**: DASHおよびSmoothStreamingサポート
- **Video.js**: ビデオプレイヤーベース
- **MPV Adapter**: JSON-IPCを介したmpvプレイヤーサポート（RTMP、MPEG-TSなど）
- **UI Framework**: Electron Renderer Process
- **Location**: `app/` directory

### ⚙️ Backend
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron%20Main-191970?style=flat-square&logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

- **Main Process**: Node.js + Electron Main Process
- **API**: Preload Scripts & IPC Communication
- **mpv Integration**: 外部mpvプロセス制御（JSON-IPC socket）
- **Location**: `src/` directory

## 📺 プレイヤーサポート

### 内部プレイヤー
- **HLS.js**: M3U8、HLSストリーム（デフォルト）
- **Shaka Player**: DASH、SmoothStreaming
- **Video.js**: 汎用ビデオプレイヤー
- **Native HTML5 Video**: MP4、WebM、Ogg

### MPVプレイヤー（新機能！）

- **外部プロセス実行**: MPVプレイヤーはアプリ外部で別プロセスとして実行されます。
- **JSON-IPC制御**: ElectronメインプロセスからJSON-IPCソケットを介してMPVを制御します。
- **多様なフォーマットサポート**: RTMP、MPEG-TS、HLS、DASHなど多様なストリームフォーマットをサポートします。
- **高性能再生**: ハードウェアアクセラレーションおよび高度なビデオフィルタリングをサポートします。
- **設定**: 外部プレイヤーパスを指定可能、デフォルトパスを自動検知します。

## 🎨 アプリアイコン

アプリアイコンは`build/icon.ico`（Windows）および`build/icon.icns`（macOS）から読み込まれます。デフォルトのTVスタイルアイコンを自動生成するには`python generate_icon.py`を実行してください（事前インストール: `pip install pillow`）。

アイコンを手動で作成するには:
1. 1024×1024px以上のPNGでTVシルエットを描きます。
2. `.ico`は[icoconvert.com](https://icoconvert.com/)またはImageMagick/`convert`を使用、`.icns`はmacOS `iconutil`で変換。
3. 生成されたファイルを`build/`に置き、コミットするとビルド時に自動反映されます。

> ビルド設定は`package.json`で既に`build/icon.ico`と`build/icon.icns`を指しています。

## 📥 ダウンロード

最新リリースをダウンロードしてください:

🔗 **[リリースページへ移動](https://github.com/Michael09011/IPTV-Desktop/releases/tag/IPTV-Desktop)**

- 🍎 **macOS**: DMGファイル
- 🪟 **Windows**: NSISインストーラー

## 🚀 クイックスタート

1. **依存関係インストール**
   ```bash
   npm install
   ```
2. **開発モード実行**
   ```bash
   npm start
   ```

3. **設定メニュー**
   - プレイリストごとにEPG URL指定可能
   - EPG機能オン/オフ
   - M3UおよびEPG自動更新間隔（6/12/24時間）設定
   - 自動更新完了/失敗時トースト通知
   - GPU、キャッシュ、自動バックアップ/更新オプションサポート
   - ネットワークバッファ: 自動/手動モード選択、手動時バッファ長調整（デフォルト30秒、推奨60~120秒）
   - 外部プレイヤー: VLCなど外部プレイヤー使用時パス指定（デフォルトパス自動検知、手動指定可能）
   - 言語変更オプション: アプリUI言語を韓国語/英語/日本語などに直接切り替え可能（v0.1.3追加）

3. **プラットフォーム別ビルドテスト**（Windows/macOS共通設定適用済み）
   ```bash
   # Windows専用: NSISインストーラー + ポータブル
   npm run dist:win
   
   # macOS専用（Macでのみ実行可能）
   npm run dist:mac
   
   # 両プラットフォーム生成（Macで実行）
   npm run dist:all
   ```

## 📦 バンドル（配布用）作成

### 🪟 Windows
- インストーラー（NSIS）+ ポータブル
  ```bash
  npm run dist:win
  # 結果: dist/IPTV-Desktop Setup 0.1.0.exe
  #         dist/IPTV-Desktop-Portable.exe
  ```

### 🍎 macOS（build toolはmacOSで実行する必要があります）
- デフォルトDMG（x64）
  ```bash
  npm run dist:mac
  # 結果: dist/IPTV-Desktop-Mac-0.1.0.dmg
  ```
- Universal（x64 + arm64）
  ```bash
  npx electron-builder --mac --x64 --arm64
  ```

### 🌍 全プラットフォーム
- macOSで実行すると両プラットフォーム:
  ```bash
  npm run dist:all
  ```

## 🔍 アプリ実行 / 検査
- DMG開く（インストールウィンドウ）: `open dist/IPTV-Desktop-0.1.0.dmg`
- .app直接実行: `open dist/IPTV-Desktop.app`
- アプリ内部リソース確認: `ls -la dist/IPTV-Desktop.app/Contents/Resources/app`

## ⚠️ 重要動作 / 注意事項

- **初回実行時プレイリスト初期化**
  - パッケージ化された（バンドル）アプリが初回実行時に既存`playlists.json`を空配列で初期化します。
  - 初期化は一度のみ実行され、ユーザー データフォルダに`playlists_cleared_v1`（sentinel）ファイルを作成して再初期化されないようにします。
  - 開発環境で初期化を再検証するにはユーザーアカウントのアプリ`userData`フォルダからsentinelファイルを削除してください。

- **サイドバートグル**
  - 画面左上固定トグルボタン（◀/▶）。クリックでサイドバー展開/折りたたみ。
  - トグルはレイアウトを直接更新するためビデオ再生が中断されません。

- **コード署名 / 公証**
  - 現在のビルドはコード署名が適用されていません。配布（App Store外配布含む）にはApple DeveloperアカウントのDeveloper ID証明書で署名し、公証する必要があります。
  - electron-builder設定と証明書準備方法はelectron-builderドキュメント（https://www.electron.build/code-signing）を参照してください。

## 🐛 デバッグ/ログ
- 開発中コンソールログは`npm start`実行ターミナルおよび開発者ツール（Inspect）で確認してください。

## 📂 プロジェクト構造

- **Frontend**: `app/`（HTML、CSS、Vanilla JavaScript）
- **Backend**: `src/`（Main Process、Preload Scripts）
- **Build Output**: `dist/`（`.dmg`、`.exe`など）
- **Resources**: `assets/`、`build/`（アイコンなど）

## 🔐 認証が必要なストリーム

特定のURLパターンに対してHTTPヘッダーを追加できます。

```javascript
// Authorizationヘッダー追加
window.electronAPI.authSet({
  pattern: 'example.com',
  useRegex: false,
  headers: { Authorization: 'Bearer TOKEN' }
});

// 設定された認証リスト照会
window.electronAPI.authList().then(console.log);
```

## 💻 システム要件

- **macOS**: 10.13以上
- **Windows**: Windows 7以上
- **Node.js**: 18.0.0以上
- **ディスク容量**: 最小200MB

## ⭐ お気に入り機能使用法

- **お気に入り追加**: チャンネルリストで星（☆）ボタンをクリックしてお気に入りに追加。既に追加された項目は星が塗りつぶされた（★）状態で表示。
- **お気に入り管理**: メイン画面左サイドバーで`お気に入り (N)`ボタンをクリックしてお気に入り管理モーダルを開く。モーダルで名前とグループを編集したり、項目を再生/削除可能。
- **検索/フィルター**: チャンネル画面で検索窓に複数トークンを入力すると名前/グループ/TVG/URLに全てのトークンを含む項目のみ表示。`お気に入りのみ`チェックボックスでお気に入り項目のみフィルタリング可能。
- **EPG機能**: 各チャンネルの現在放送情報が表示。設定でオン/オフ可能、プレイリストごとにEPG URL指定可能。
- **自動更新**: M3UおよびEPGデータを6/12/24時間間隔で自動更新設定可能。更新時トースト通知表示。
- **エクスポート/インポート**: お気に入りリストをJSONでエクスポート（ブラウザダウンロード）またはインポート。
- **ファイル同期**: システムファイルに保存またはファイルから読み込み機能追加。`ファイルに保存` / `ファイルから読み込み`ボタンでローカルファイルに直接保存/読み込み可能。

## 🧪 簡単テスト

1. **アプリ実行**:
   ```bash
   npm start
   ```
2. **プレイリスト開く**: 左上`読み込み`からm3uファイルまたはURLでプレイリスト読み込み。
3. **チャンネル画面進入**: プレイリストの`チャンネル表示`ボタンをクリック。
4. **お気に入り追加/削除**: チャンネル項目の星ボタンをクリックして追加/削除。
5. **お気に入りファイル保存/読み込み**: チャンネル画面の`ファイルに保存`ボタンでfavorites.jsonを保存、`ファイルから読み込み`ボタンで再読み込み。

## 📱 Windows MPVインストールおよび使用案内

WindowsでMPVプレイヤーを利用するには以下の手順に従ってください。

1. MPVインストール
   - Chocolatey使用:
     - 管理者PowerShellで`choco install mpv`実行
   - Scoop使用:
     - `scoop install mpv`
   - またはhttps://mpv.io/からWindowsビルドダウンロード後解凍
2. MPVパス確認
   - `mpv.exe`位置をコピー。
   - 例: `C:\Program Files\mpv\mpv.exe`
3. IPTV-Desktopで設定
   - 設定ボタンクリック
   - "外部プレイヤー使用"有効化
   - 外部プレイヤーパスを`mpv.exe`パスで入力
4. MPV再生テスト
   - プレイリストからチャンネル選択後再生
   - 問題があればパスと実行権限を再確認

追加Tips:
- `mpv.conf`を使用してバッファ、キャッシュ、字幕などを調整可能。
- WindowsでUAC権限問題が発生したら管理者権限で実行。

---

## 📝 ライセンス

© 2026 Michael. All rights reserved.

MIT License - see LICENSE file for details

---

問題があるか追加改善（グループフォルダツリー、リモート同期など）を希望する場合はイシューを登録してください。