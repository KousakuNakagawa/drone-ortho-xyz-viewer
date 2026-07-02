# Drone Ortho XYZ Viewer

研究室内で `ODM -> OAM -> Web Viewer` の流れをスムーズにするための、軽量なWeb GISビューアです。

ひなたGISの完全な代替ではなく、OpenDroneMapで作成したオルソ画像やOpenAerialMapのXYZタイルを、URLを貼るだけで確認できることを目的にしています。

## 特徴

- MapLibre GL JSを使用
- GitHub Pagesだけで公開可能
- サーバー不要
- APIキー不要
- 地理院標準地図、地理院航空写真、OpenStreetMapの背景地図切替
- 地名・住所検索と候補選択
- XYZタイルURLの読み込み
- レイヤーのON/OFF、削除、名前変更
- 透明度調整
- 現在位置、ズーム、XYZ URLを共有URLに保存
- GeoJSONのドラッグ&ドロップ表示
- GeoJSONクリック時のpropertiesポップアップ表示

## ファイル構成

```text
/
  index.html
  style.css
  app.js
  README.md
```

## 実行方法

セットアップは不要です。

`index.html` をブラウザで開くと利用できます。

ただし、ブラウザや環境によってはローカルファイルからの読み込みに制限があるため、公開時はGitHub Pagesでの利用を推奨します。

## GitHub Pagesで公開する方法

1. GitHubで新しいリポジトリを作成します。
2. `index.html`、`style.css`、`app.js`、`README.md` をリポジトリ直下へ配置します。
3. GitHubのリポジトリ画面で `Settings` を開きます。
4. `Pages` を開きます。
5. `Build and deployment` の `Source` で `Deploy from a branch` を選びます。
6. `Branch` で `main`、フォルダで `/root` を選びます。
7. `Save` を押します。
8. 数分後に表示されるURLへアクセスします。

## XYZタイルURLの読み込み方法

左側の `XYZタイル読込` にURLを入力し、`読み込み` を押します。

URLは以下の形式にしてください。

```text
https://example.com/{z}/{x}/{y}.png
```

必ず `{z}`、`{x}`、`{y}` を含める必要があります。

OpenAerialMapのURLで、以下のように `{z}`、`{x}`、`{y}` が `%7Bz%7D`、`%7Bx%7D`、`%7By%7D` と表示されている場合も、そのまま貼り付けできます。アプリ側でMapLibre用の形式へ自動変換します。

```text
https://tiles.openaerialmap.org/.../%7Bz%7D/%7Bx%7D/%7By%7D
```

OpenAerialMapのタイルは環境によってCORS制限でMapLibreのRaster Sourceとして読めないことがあります。そのため、`tiles.openaerialmap.org` のURLは自動的にOAM互換モードで表示します。地図上に通常の画像タイルとして重ねるため、CORSによる `Failed to fetch` を避けやすくしています。

OAM互換モードで表示されない場合は、撮影地点付近まで拡大してください。OAMのオルソ画像は撮影範囲が狭いことが多く、日本全体表示などでは範囲外タイルが取得されません。

表示されない場合は、以下を確認してください。

- URLに `{z}`、`{x}`、`{y}` が含まれているか
- 画像形式が `.png`、`.jpg`、`.jpeg` などブラウザで表示できる形式か
- タイルサーバーが外部サイトからの読み込みを許可しているか
- CORSエラーが発生していないか
- タイルの公開範囲と現在の地図表示位置が合っているか
- 対応ズーム範囲内で表示しているか

## 地名検索の使い方

左側の `地名検索` に地名や住所を入力して `検索` を押します。

同じ地名の候補が複数ある場合は、候補一覧が表示されます。目的の候補をクリックすると、その場所へ地図が移動し、赤いマーカーを表示します。

検索には国土地理院の住所検索APIとOpenStreetMap Nominatimを利用しています。APIキーは不要です。

## OpenAerialMapとの利用例

1. ドローン画像をOpenDroneMapでオルソ画像にします。
2. 生成したオルソ画像をOpenAerialMapへアップロードします。
3. OpenAerialMapで対象データのタイルURLを確認します。
4. このアプリの `XYZタイルURL` 欄へ貼り付けます。
5. `読み込み` を押します。
6. 必要に応じて透明度を調整し、背景地図と重ねて確認します。
7. `現在の状態をURLへ保存` を押すと、共有URLを作成できます。

## GeoJSONの利用方法

GeoJSONファイルを左側の `GeoJSON追加` エリアへドラッグ&ドロップします。

読み込んだGeoJSONは地図上に表示されます。地物をクリックすると、`properties` の内容をポップアップで確認できます。

## 今後追加できる機能

- PMTiles対応
- COG対応
- OpenAerialMap API検索
- GeoTIFF表示
- 属性検索
- ベクトルタイル対応
- ドローン画像比較 Before / After
- タイムスライダー
- 標高データ表示
- 距離・面積の計測機能
- 複数XYZレイヤーの順序変更
- レイヤー設定のJSONエクスポート、インポート

## 開発メモ

このアプリは、初学者でも読みやすいようにHTML、CSS、JavaScriptだけで構成しています。

`app.js` は以下の役割ごとに関数を分けています。

- 地図初期化
- 背景地図切替
- XYZタイルURL検証
- Raster Source / Layer追加
- レイヤー管理
- GeoJSON読み込み
- URL共有

将来、PMTiles、COG、OAM API検索などを追加する場合も、既存の関数を大きく崩さずに拡張できます。
