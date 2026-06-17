# Push Signal

Web Pushだけでシグナリングを行う、サーバーレスなWebRTC P2P通話のPoCです。外部シグナリングサービスやDBを使わず、Vercelの環境変数とAPI Routeのみで構成しています。

## 仕組み

- 発信者がofferを作成し、自分のPush subscriptionと一緒にURLに埋め込んでリンクを生成
- 着信者がリンクを開いてanswerを作成し、Web Push経由で発信者に送信
- 接続後はDataChannelを信号路として再利用し、音声/映像トラックの追加(re-negotiation)を行う

## セットアップ

```bash
pnpm install
npx web-push generate-vapid-keys
```