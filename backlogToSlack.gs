const POSTURL = "https://hooks.slack.com/services/■■■" //SlackアプリのURL
const POSTURL_TEST = "https://hooks.slack.com/services/■■■" //テスト用SlackアプリのURL
const BACKLOG_BASEURL = "https://■■■.backlog.jp/"; //Backlogのスペース
const BACKLOG_PROJECT_ID = '■■■';   //Backlogのプロジェクト
const BACKLOG_API_KEY    = "■■■";  //Backlogの秘密鍵
const SLACK_TOKEN = '■■■'; //SlackAPIBotの認証トークン
const SLACK_CHANNEL = '■■■';  //メンバー取得対象のSlackチャンネル

const TICKET_TYPE = {
  1:"課題を作成",
  2:"課題を更新",
  3:"課題にコメント"
};

//標準項目のうち、通知で表示する項目
const STATUS_LABEL = {
  "issueType":"種別",
  "priority":"優先度",
  "assignee":"担当者",
  "category":"カテゴリー",
  "versions":"発生バージョン"
};

// backlogからのjsonを整形
function makeChatMessage(body) {
  let msgObj = new Object();
  let bl_detail = "";
  let bl_url = "";
  let bl_to = [];
  
  switch (body.type) {
      
    case 1:  //課題の追加
      bl_url = BACKLOG_BASEURL+"view/"+body.project.projectKey+"-"+body.content.key_id;
      bl_detail = body.content.description;  //詳細を記入しなかった場合、空文字で表現される
      bl_to.push("<!channel>");
      
      let fields = [];
      let fieldValues = [];
      msgObj['status'] = [];
      
      //標準項目取得  
      for(const key in body.content) {
        if(!body.content[key]){  ////値が無い場合はNULLで表現される
          continue;
        }
        if(STATUS_LABEL[key]){
          if(body.content[key].length >= 1 ){  ////複数選択可の項目で値がない場合、空の配列で表現されるか要確認
            for(const value of body.content[key]){
              fieldValues.push("`" + value.name + "`");
            }
            fields = fields.concat({
              "title": "*"+ STATUS_LABEL[key] + "*",
              "value": fieldValues.join(),
              "short": true
            }); 
            fieldValues = [];
          }else{
            fields = fields.concat({
              "title": "*"+ STATUS_LABEL[key] + "*",
              "value": "`" + body.content[key].name + "`",
              "short": true
            }); 
          } 
        }      
      }
      
      //カスタム項目取得
      for(const customField of body.content.customFields){
        if(!customField.value || !customField.value.length){  //値がない項目のうち、複数選択不可の場合はNULLで、複数選択可の場合は空の配列で表現される
          continue;
        }
        if(typeof(customField.value) == 'object' ){ //複数選択可の項目ある場合、2次元の連想配列で表現される
          for(const fieldValue of customField.value){
            fieldValues.push("`" + fieldValue.name + "`");
          }
          fields = fields.concat({
            "title": "*" + customField.field + "*",
            "value": fieldValues.join(),
            "short": true
          });
          fieldValues = [];
        }else{
          const isLongStr = customField.value.includes('\n');
          if(isLongStr){
            fields = fields.concat({
              "title": "*" + customField.field + "*",
              "value": "```" + customField.value + "```",
              "short": false
            });  
          }else{
            fields = fields.concat({
              "title": "*" + customField.field + "*",
              "value": "`" + customField.value + "`",
              "short": true
            });  
          }   
        }   
      }  
      
      msgObj['status'] = {
        "fields":fields
      };
      
      break; 
      
    case 2:  //課題を更新
    case 3:  //課題にコメント
      //通知先ユーザが設定されていないか、コメントされていなければ何もしない
      if(body.notifications.length < 1 || !body.content.comment.content){
        return false;
      }
      
      bl_url = BACKLOG_BASEURL + "view/" + body.project.projectKey + "-" + body.content.key_id + "#comment-" + body.content.comment.id;
      bl_detail = body.content.comment.content;
      
      const usersMap = getUsersMap();  //BacklogとSlackのユーザマップを取得する

      for(const notification of body.notifications){
        let backlogId = notification.user.id;
        
        for(const user of usersMap){
          //BacklogのメンションをSlackのメンションに置換する
          if(backlogId == user.backlogId){
            bl_to.push("<@" + user.slackId + "> "); 
            let backlogName = user.email;
            const pos = backlogName.indexOf("@");
            backlogName = "@" + backlogName.substring(0, pos);
            
            //Backlogのメンション箇所を削除する
            if(bl_detail.includes(backlogName)){ //前方重複など細かいところは考慮されていない
            bl_detail = bl_detail.replace(new RegExp(backlogName,"g"),"");
            }
            //メンション箇所削除後、残りそうなゴミ文字を削除する
            if(bl_detail.slice(0,1) == " " || bl_detail.slice(0,1) == "," || bl_detail.slice(0,1) == "、"){
            bl_detail = bl_detail.slice(1);
            }
            //メンション箇所削除後、残りそうな空行を削除する
            if(bl_detail.slice(0,2) == "\n"){
            bl_detail = bl_detail.slice(2);
            }
            break;
          }
        }
      } 
      break; 
      
    default:
      return false;
  }
  
  msgObj['color'] = {
    "color": "#42ce9f"  ////引用線の色
  };
  
  var summaryStr = "*" + body.createdUser.name + "* さんが" + TICKET_TYPE[body.type] + "しました。\n"
  + "*<" + bl_url + "|" + "["+body.project.projectKey+"-"+body.content.key_id+"]" + body.content.summary + ">*";
  msgObj['summary'] = {"fallback": summaryStr,  //モバイル端末などのポップアップ通知文　※必須
                       "pretext": summaryStr  //引用外テキスト
                      };
  
  msgObj['detail'] = {
    "text": bl_to + "\n" + bl_detail  //引用テキスト
  };
  
  var attachmentObj = Object.assign(msgObj['color'],
                                    msgObj['summary'],
                                    msgObj['detail']
                                   );
  
  //ステータス情報があれば
  if(msgObj['status']){
    attachmentObj = Object.assign(
      attachmentObj,
      msgObj['status'] 
    ) ;
  }
  
  var jsonData = {
    "attachments": [ attachmentObj ]
  };
  console.log("送信データ：");
  console.log(jsonData);
  
  return jsonData;
}


// slackに投げる
function postSlack(e,jsonData){
  
  var payload = JSON.stringify(jsonData);
  
  var options = {
    "method" : "post",
    "contentType" : "application/json",
    "payload" : payload
  };
  
  //テスト判定
  let isTest = true;
  if(e.parameter.isTest){
    isTest = e.parameter.isTest;
  }else{
    isTest = false;
  }
  console.log("テスト？：" +  isTest);
  
  if(isTest){
    UrlFetchApp.fetch(POSTURL_TEST, options);
  }else{
    UrlFetchApp.fetch(POSTURL, options);
  }
  
  
}

/*
■■■Backlogのプロジェクトに参加しているユーザ一覧を返却する■■■
*/
function getBacklogUsers(){
  const response = UrlFetchApp.fetch(BACKLOG_BASEURL + "/api/v2/projects/" + BACKLOG_PROJECT_ID + "/users?apiKey="+ BACKLOG_API_KEY);
  
  if (response.getResponseCode() != 200) {
    return false;
  }
  
  const body = JSON.parse(response.getContentText());
  //console.log(body);
  
  let users = [];
  
  for(const user of body){
    users = users.concat({
      "id":user.id,
      "email":user.mailAddress
    });
  }
  
  //console.log(users);
  return users;
  
}

/*
■■■Slackに参加しているユーザ一覧を返却する■■■
*/
function getSlackUsers(){
  const response = UrlFetchApp.fetch("https://slack.com/api/users.list?token=" + SLACK_TOKEN); //URL+cityID
  
  if (response.getResponseCode() != 200) {
    return false;
  }
  
  const　body = JSON.parse(response.getContentText());
  
  let users = [];
  
  for(const member of body.members){   
    if(member.deleted == false && member.profile.email){
      users = users.concat({
        "id":member.id,
        "email":member.profile.email
      });
    }
  } 
  
  //console.log(users);
  return users;
  
}

/*
■■■チャンネルに参加しているユーザID一覧を返却する■■■
*/
function getSlackChannelMembers(){
  const response = UrlFetchApp.fetch("https://slack.com/api/conversations.members?token=" + SLACK_TOKEN + "&channel=" + SLACK_CHANNEL); //URL+cityID
  
  if (response.getResponseCode() == 200) {
    const body = JSON.parse(response.getContentText());
    //console.log(body.members);
    return body.members;
  }else{
    return false;
  }
  
}

/*
■■■Slackのチャンネルに参加しているユーザ一覧の仮想配列を返却する■■■
*/
function getSlackMembers(){   
  const users = getSlackUsers();  //Slackに参加しているユーザ一覧
  //console.log(users);
  const channelMembers = getSlackChannelMembers();  //チャンネルに参加しているユーザID一覧
  //console.log(channelMembers);
  
  let slackMembers = [];
  
  for(const channnelMenber of channelMembers){
    for(const user of users){
      if(user.id == channnelMenber){
        slackMembers = slackMembers.concat({
          "id":user.id,
          "email":user.email
        });
        break;
      }
    }  
  }
  //console.log(slackMembers);
  return slackMembers;
  
}

/*
■■■BacklogとSlackのユーザマップを返却する■■■
*/
function getUsersMap(){
  const slackUsers = getSlackMembers();
  const backlogUsers = getBacklogUsers();
  //console.log(slackUsers);
  //console.log(backlogUsers);
  
  var usersMap = [];
  
  for(const backlogUser of backlogUsers){
    for(const slackUser of slackUsers){
      if(backlogUser.email == slackUser.email){
        usersMap = usersMap.concat({
          "backlogId" : backlogUser.id,
          "slackId" : slackUser.id,
          "email" : backlogUser.email
        });
        break;
      }
    }
  }
  
  console.log("SlackとBacklogのユーザ情報マッピング：");
  console.log(usersMap);
  return usersMap;
  
}

function doPost(e) {
  if(!e.postData.contents){
    console.log('対象チャンネルが指定されていないか、データが取得できません。');
  }
  
  // json整形・メッセージ作成
  const body = JSON.parse(e.postData.contents);
  const jsonData = makeChatMessage(body);
  
  // Slack投稿
  if(jsonData){
    postSlack(e,jsonData);
  }
  
}