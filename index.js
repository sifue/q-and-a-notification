'use strict';
const client = require('cheerio-httpcli');
const request = require('request');
const fs = require('fs');

// 設定読み込み
const configJson = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
let questionsJson = {};
let questionsLinkSet = new Set();
try {
  fs.accessSync('./questions.json', fs.R_OK | fs.W_OK);  
  questionsJson = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
  console.log('----保存していたQ&A----');
  console.log(questionsJson);
  for(let q of questionsJson) {
    questionsLinkSet.add(q.link);
  }
  console.log('----保存していたQ&Aのリンク----');
  console.log(questionsLinkSet);
} catch (e) {
  console.log('questions.json is not exists. error:' + e);
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

// Q&Aの一覧
const pQuestionList = pTop.then((result) => {
  return result.$('.u-list-header-show-more > a').click();
});

// 新着のQ&Aのテキストの取得
const pQuestions = pQuestionList.then((result) => {
  const ankers = result.$('.p-questions-list > li > a');
  const results = [];
  ankers.each(function(index){
    const question = result.$('p', this).text();
    const link = result.$(this).attr('href');
    const name = result.$('.p-questions-information-item', this).eq(0).text();
    const tags = result.$('.u-tags > li', this).map((i, e) => {
      return result.$(e).text();
    }).get().join(', ');
    results.push({
      question: question,
      link: link,
      name: name,
      tags: tags
    });
  });
  return results;
});

// 取得したQ&Aを処理
pQuestions.then((questions) => {
  console.log('----取得したQ&A----');
  console.log(questions);

  // questionsが存在し、保存していたものと取得したものが違えば処理 (すでになんらかの質問は存在している前提とする)
  if (questions.length > 0 &&
      JSON.stringify(questionsJson) !== JSON.stringify(questions)) {
    console.log('処理開始');
    // 取得したものの先頭から処理して、1分前のものにあれば投稿
    for (let q of questions) {
      if (!questionsLinkSet.has(q.link)) {
        let message = '【新規Q&A】: [' + q.tags + '] by ' + q.name + '\n' +
                      q.question + '\nhttp://www.nnn.ed.nico' + q.link;
        let headers = {
          'Content-Type': 'application/json'
        };
        let options = {
          url: 'https://slack.com/api/chat.postMessage',
          method: 'POST',
          headers: headers,
          json: true,
          form: {
            token: configJson.slackWebApiToken,
            channel: configJson.slackChannel,
            text: message,
            username: 'q-and-a-notification',
            icon_url: 'http://lorempixel.com/48/48'
          }
        };
        request.post(options, (e, r, body) => {
          if (e) {
            console.log('error: ' + e);
          } else {
            console.log('----投稿内容----');
            console.log(message);
          }
        });
      } else {
        break;
      }
    }
    // ファイルに取得したものを保存
    fs.writeFile('./questions.json', JSON.stringify(questions), (err) => {
      if (err) throw err;
      console.log('------------');
      console.log('ファイルに取得した取得したQ&Aを保存しました。');
    });
  }
});
