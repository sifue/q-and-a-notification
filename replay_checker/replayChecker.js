'use strict';
const client = require('cheerio-httpcli');
const { WebClient } = require('@slack/client');
const fs = require('fs');

// 設定読み込み
const configJson = JSON.parse(fs.readFileSync('replay_checker/replay_checker_config.json', 'utf8'));
let replaysJson = {};
let replaysLinkAndTimeSet = new Set();
try {
  fs.accessSync('replay_checker/replays.json', fs.R_OK | fs.W_OK);
  replaysJson = JSON.parse(fs.readFileSync('replay_checker/replays.json', 'utf8'));
  console.log('----保存していた返信----');
  console.log(replaysJson);
  for (let r of replaysJson) {
    replaysLinkAndTimeSet.add(r.link + ' : ' + r.content);
  }
  console.log('----保存していたQ&Aのリンク----');
  console.log(replaysLinkAndTimeSet);
} catch (e) {
  console.log('replay_checker/replays.json is not exists. error:' + e);
}

// N予備校 ログイン
const pLogin = client.fetch('http://www.nnn.ed.nico/login');
const pNiconicoLogin = pLogin.then((result) => {
  return result.$('.u-button.type-primary').click();
});

// ニコニコ ログイン
const pTop = pNiconicoLogin.then((result) => {
  result.$('#input__mailtel').val(configJson.niconidoId);
  result.$('#input__password').val(configJson.niconicoPassword);
  return result.$('form[id=login_form]').submit();
});

// トップへのアクセスを確認して通知一覧へ
const pNotices = pTop.then((result) => {
  return client.fetch('http://www.nnn.ed.nico/notices');
});

// 通知一覧から
const pReplays = pNotices.then((result) => {
  const notices = result.$('p.p-notices-list-title');
  const replays = [];
  notices.each(function (index) {
    const title = result.$(this).text();
    if (title.includes('コメントがつきました！')) {
      const link = result.$(this).parent().parent().attr('href');
      const content = result.$(this).next().text();
      const time = result.$(this).parent().prev().text();
      const replay = {
        title: title,
        link: link,
        content: content,
        time: time
      };
      replays.push(replay);
    }
  });
  return replays;
});

// 返信を処理
const pPosted = pReplays.then((replays) => {
  console.log('----取得した返信 ----');
  console.log(replays);

  const promisesPostMessage = [];

  // time が '1分前' みたいな表示のことがあるので取り除く
  replays.forEach((e) => {
    e.time = null;
  });

  // replaysが存在し、保存していたものと取得したものが違えば処理 (すでになんらかの質問は存在している前提とする)
  if (replays.length > 0 &&
    JSON.stringify(replaysJson) !== JSON.stringify(replays)) {
    console.log('処理開始');

    // 取得したものの先頭から処理して、1分前のものにあれば投稿
    for (let r of replays) {
      if (!replaysLinkAndTimeSet.has(r.link + ' : ' + r.content)) {
        console.log(r);
        let message = '【返信】:  "' + r.content + '" https://www.nnn.ed.nico/' +
          r.link + ' to ' + configJson.niconidoId;

        const token = configJson.slackWebApiToken;
        const web = new WebClient(token);
        promisesPostMessage.push(
          web.chat.postMessage({ channel: configJson.slackChannel, text: message }));
      } else {
        break;
      }
    }
  }

  // ファイルに取得したものを保存 (非同期)
  fs.writeFile('replay_checker/replays.json', JSON.stringify(replays), (err) => {
    if (err) throw err;
    console.log('------------');
    console.log('ファイルに取得した取得した新規返信を保存しました。');
  });

  return Promise.all(promisesPostMessage);
});

pPosted.then(() => {
  console.log('Finished.');
}).catch((e) => {
  console.log('Error occured:');
  console.log(e);
});



