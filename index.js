'use strict';
const client = require('cheerio-httpcli');
const request = require('request');
const fs = require('fs');
const nodemailer = require('nodemailer');

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

// Q&Aの一覧
const pQuestionList = client.fetch('https://api.nnn.ed.nico/v1/questions?offset=0&detail=false');

// 新着のQ&Aのテキストの取得
const pQuestions = pQuestionList.then((result) => {
  const json = JSON.parse(result.body);
  const questions = json.questions;
  questions.sort((a, b) => parseInt(b.id) - parseInt(a.id));
  const results = [];
  questions.forEach((e) => {
    const question = e.title;
    const link = 'https://www.nnn.ed.nico/questions/' + e.id;
    const name = e.user.name;
    const tags = e.tags.join(', ');
    const group = e.group;
    results.push({
      question: question,
      link: link,
      name: name,
      tags: tags,
      group: group
    });
  });
  return results;
});

// 取得したQ&Aを処理
let pFinished = pQuestions.then((questions) => {
  console.log('----取得したQ&A----');
  console.log(questions);

  // questionsが存在し、保存していたものと取得したものが違えば処理 (すでになんらかの質問は存在している前提とする)
  if (questions.length > 0 &&
      JSON.stringify(questionsJson) !== JSON.stringify(questions)) {
    console.log('処理開始');
    // 取得したものの先頭から処理して、1分前のものにあれば投稿
    for (let q of questions) {
      if (!questionsLinkSet.has(q.link)) {
        // Slackに送信
        let title = '【新規Q&A】: [' + q.tags + '] by ' + q.name;
        let message = title + '\n' +
                      q.question + '\n' + q.link;
        let headers = {
          'Content-Type': 'application/json'
        };

        let channelAndFilters = configJson.slackChannelAndFilters;
        channelAndFilters.forEach((channelAndFilter) => {
          let slackChannel = channelAndFilter[0];
          let filter = channelAndFilter[1];
          let regex = new RegExp(filter);

          if (regex.test(message)) {
            let options = {
              url: 'https://slack.com/api/chat.postMessage',
              method: 'POST',
              headers: headers,
              json: true,
              form: {
                token: configJson.slackWebApiToken,
                channel: slackChannel,
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
          }
        });
        
        // Mail 送信
        // create reusable transporter object using the default SMTP transport
        let transporter = nodemailer.createTransport(configJson.mailSetting);
        // setup email data with unicode symbols
        let mailOptions = {
            from: '"N予備Q&A" <nyobi_qa@nnn.ac.jp>', // sender address
            to: 'nyobi_qa@nnn.ed.jp', // list of receivers
            subject: title, // Subject line
            text: message // plain text body
        };
        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('Message %s sent: %s', info.messageId, info.response);
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

pFinished.then(() => {
  console.log('Finished.');
}).catch((e) => {
  console.log('Error occured:');
  console.log(e);
});
