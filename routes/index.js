'use strict'

// var express = require('express');
const express = require('express')
var url = require('url');

var router = express.Router();
const debug = require('debug')('my-issuer-app');

//evernyms code start
const fs = require('fs')
const axios = require('axios')
// const express = require('express') //repeated
const QR = require('qrcode')
const uuid4 = require('uuid4')
const urljoin = require('url-join');

const ANSII_GREEN = '\u001b[32m'
const ANSII_RESET = '\x1b[0m'
const CRED_DEF_FILE = 'public/images/cred_def_id.txt'
// const PORT = 4000

const verityUrl = 'https://vas.pps.evernym.com' // address of Verity Application Service
var domainDid = '2jbgD5nXSkCm3g5mGFW5XD' // your Domain DID on the multi-tenant Verity Application Service
var xApiKey = '6jJWRCseGVHXFtPCasrrbkexkptHTg29xM3w261DqN4Y:5Mej4QwNgTfU6A9RNXY4QnQE1hcqYB2PcJZpbDxZFccxZaKnSmTG4B9ab5vHvunzNKukqjTjrxNbCru8zVRhU9MZ' // REST API key associated with your Domain DID
// const webhookUrl = '<< PUT WEBHOOK URL HERE >>' // public URL for the webhook endpoint
//end evernym's code

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/webhook', function(req, res, next) {
  res.render('webhook');
});

router.get('/config', function(req, res, next) {
  res.render('config');
});

router.get('/relation', function(req, res, next) {
  res.render('relation', {domaindid: domainDid}); 
});

router.get('/proofres', function(req, res, next) {
  res.render('proofres');
});

router.get('/webhook_update', async function(req, res) {
  var webhookurl = req.query.webhookurl;
  var webhookurlFinal = webhookurl+'/webhook';  //append /webhook endpoint
  await updateWebhookEndpoint(webhookurlFinal).then(function(){
    var currentUrl = req.url
    var urlname = url.parse(currentUrl, true);
    res.render('success', {message: 'Webhook Endpoint Updated Successfully', routename: urlname.pathname});
  }).
  catch(function (err){
    console.log("WRONG ENDPOINT");
    debug("fail")
    res.render('fail', {message: "Something went wrong"});
});
})

router.get('/update_config', async function(req, res) {
  var verifiername = req.query.verifiername;
  var logourl = req.query.logourl;
  await updateConfiguration(verifiername, logourl);

  var currentUrl = req.url
  var urlname = url.parse(currentUrl, true);

  res.render('success', {message: 'Configuration Updated Successfully', routename: urlname.pathname});
})

router.get('/create_relationdid', async function(req, res) {
  await createRelation();
  var currentUrl = req.url
  var urlname = url.parse(currentUrl, true);
  res.render('success', {message: 'Scan QR Code from connect.me<br> <b>Relationship DID: </b>'+relationshipDidGlobal+'<br><i>Please save RelationshipDID for Proof Request.</i>', routename: urlname.pathname, qrcode: 'qrcode.png'});
})

router.get('/proof_request', async function(req, res) {
  var proofrequestname = req.query.proofrequestname;
  var relationshipdid = req.query.relationshipdid;
  var proofattributes = req.query.proofattributes;
  await proofRequest(proofrequestname, relationshipdid, proofattributes);

  var currentUrl = req.url
  var urlname = url.parse(currentUrl, true);

  res.render('success', {message: 'Proof Validated Successfully', routename: urlname.pathname});
})

router.get('/success', function(req, res, next) {
  res.render('success', { message: 'Issuer Setup Successful!' });
});

router.get('/fail', function(req, res, next) {
  res.render('fail', { message: 'Issuer Setup Operation Failed!' });
});

//Actual Evernym's method

// Sends a message to the Verity Application Service via the Verity REST API
async function sendVerityRESTMessage (qualifier, msgFamily, msgFamilyVersion, msgName, message, threadId) {
  debug("inside sendverity");
  message['@type'] = `did:sov:${qualifier};spec/${msgFamily}/${msgFamilyVersion}/${msgName}`
  message['@id'] = uuid4()

  if (!threadId) {
    threadId = uuid4()
  }

  // send prepared message to Verity and return Axios request promise
  const url = urljoin(verityUrl, 'api', domainDid, msgFamily, msgFamilyVersion, threadId)
  console.log(`Posting message to ${ANSII_GREEN}${url}${ANSII_RESET}`)
  console.log(`${ANSII_GREEN}${JSON.stringify(message, null, 4)}${ANSII_RESET}`)
  return axios({
    method: 'POST',
    url: url,
    data: message,
    headers: {
      'X-API-key': xApiKey // <-- REST API Key is added in the header
    }
  })
}


// Maps containing promises for the started interactions - threadId is used as the map key
// Update configs
const updateConfigsMap = new Map()
// Relationship create
const relCreateMap = new Map()
// Relationship invitation
const relInvitationMap = new Map()
// Proof request
const proofRequestMap = new Map()
// Map for connection accepted promise - relationship DID is used as the map key
const connectionAccepted = new Map()

// Update webhook protocol is synchronous and does not support threadId
let webhookResolve

async function updateWebhookEndpoint(webhookurl){
  debug("inside updatewebhok function");
  const webhookMessage = {
    comMethod: {
      id: 'webhook',
      type: 2,
      value: webhookurl,
      packaging: {
        pkgType: 'plain'
      }
    }
  }

  const updateWebhook =
  new Promise(function (resolve, reject) {
    webhookResolve = resolve
    sendVerityRESTMessage('123456789abcdefghi1234', 'configs', '0.6', 'UPDATE_COM_METHOD', webhookMessage).catch(function (err){
      console.log("WRONG ENDPOINT");
      reject(new Error('Something went wrong, please enter a valid endpoint'))
    });
  })

  // await updateWebhook
  await updateWebhook.catch(function (err){
    console.log("WRONG ENDPOINT");
    throw new Error("something went wrong...");
});
}

async function updateConfiguration(verifiername, logourl){
  const updateConfigMessage = {
    configs: [
      {
        name: 'logoUrl',
        value: logourl
      },
      {
        name: 'name',
        value: verifiername
      }
    ]
  }

  const updateConfigsThreadId = uuid4()
  const updateConfigs =
  new Promise(function (resolve, reject) {
    updateConfigsMap.set(updateConfigsThreadId, resolve)
  })

  await sendVerityRESTMessage('123456789abcdefghi1234', 'update-configs', '0.6', 'update', updateConfigMessage, updateConfigsThreadId)

  await updateConfigs
}

let relationshipDidGlobal

async function createRelation(){
  // STEP 3 - Relationship creation
  // create relationship key
  const relationshipCreateMessage = {}
  const relThreadId = uuid4()
  const relationshipCreate =
    new Promise(function (resolve, reject) {
      relCreateMap.set(relThreadId, resolve)
    })

  await sendVerityRESTMessage('123456789abcdefghi1234', 'relationship', '1.0', 'create', relationshipCreateMessage, relThreadId)
  const relationshipDid = await relationshipCreate
  relationshipDidGlobal = relationshipDid

  // create invitation for the relationship
  const relationshipInvitationMessage = {
    '~for_relationship': relationshipDid,
    goalCode: 'request-proof',
    goal: 'To request a proof'
  }
  const relationshipInvitation =
    new Promise(function (resolve, reject) {
      relInvitationMap.set(relThreadId, resolve)
    })

  await sendVerityRESTMessage('123456789abcdefghi1234', 'relationship', '1.0', 'out-of-band-invitation', relationshipInvitationMessage, relThreadId)
  const inviteUrl = await relationshipInvitation
  console.log(`Invite URL is:\n${ANSII_GREEN}${inviteUrl}${ANSII_RESET}`)
  await QR.toFile('public/images/qrcode.png', inviteUrl)

  // wait for the user to scan the QR code and accept the connection
  const connection =
    new Promise(function (resolve, reject) {
      connectionAccepted.set(relationshipDid, resolve)
    })
  console.log('Open the file "qrcode.png" and scan it with the ConnectMe app')

  // await connection  // SD Edit. Otherwise it is not navigating to success page
}

async function proofRequest(proofrequestname, relationshipdid, proofattributes){
  var attrnameWithSpace = proofattributes.split(','); //returns element with space in the beginning
  var attrnameArray = attrnameWithSpace.map(el => el.trim()); //to remove space in the beginning of the elemnent

  const proofAttrArray = [];
  attrnameArray.forEach(element => {
    proofAttrArray.push({name: element, restrictions: [], self_attest_allowed: true})
  });
  console.log(proofAttrArray)
  // process.exit(1)
  const proofMessage = {
    '~for_relationship': relationshipdid,
    name: proofrequestname,
    proof_attrs: proofAttrArray
    // proof_attrs: [
    //   {
    //     name: 'name',
    //     restrictions: [],
    //     self_attest_allowed: true
    //   },
    //   {
    //     name: 'dob',
    //     restrictions: [],
    //     self_attest_allowed: true
    //   }
    // ]
  }

  const proofThreadId = uuid4()
  const requestProof =
    new Promise(function (resolve, reject) {
      proofRequestMap.set(proofThreadId, resolve)
    })

  await sendVerityRESTMessage('BzCbsNYhMrjHiqZDTUASHg', 'present-proof', '1.0', 'request', proofMessage, proofThreadId)

  const verificationResult = await requestProof

  if (verificationResult === 'ProofValidated') {
    console.log('Proof is validated!')
  } else {
    console.log('Proof is NOT validated')
  }

  console.log('Demo completed!')
}

// Verity Application Service will send REST API callbacks to this endpoint
router.post('/webhook', async (req, res) => {
  const message = req.body
  const threadId = message['~thread'] ? message['~thread'].thid : null
  console.log('Got message on the webhook')
  console.log(`${ANSII_GREEN}${JSON.stringify(message, null, 4)}${ANSII_RESET}`)
  res.status(202).send('Accepted')
  // Handle received message differently based on the message type
  switch (message['@type']) {
    case 'did:sov:123456789abcdefghi1234;spec/configs/0.6/COM_METHOD_UPDATED':
      webhookResolve('webhook updated')
      break
    case 'did:sov:123456789abcdefghi1234;spec/update-configs/0.6/status-report':
      updateConfigsMap.get(threadId)('config updated')
      break
    case 'did:sov:123456789abcdefghi1234;spec/relationship/1.0/created':
      relCreateMap.get(threadId)(message.did)
      break
    case 'did:sov:123456789abcdefghi1234;spec/relationship/1.0/invitation':
      relInvitationMap.get(threadId)(message.inviteURL)
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/request-received':
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/response-sent':
      connectionAccepted.get(message.myDID)('connection accepted')
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/trust_ping/1.0/sent-response':
      break
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/out-of-band/1.0/relationship-reused':
      console.log('The mobile wallet app signalled that it already has the connection with this Verifier')
      console.log('This application does not support relationship-reuse since it does not store the data about previous relationships')
      console.log('Please delete existing connection with this Verifier in your mobile app and re-run the application')
      console.log('To learn how relationship-reuse can be used check out "ssi-auth" or "out-of-band" sample apps')
      process.exit(1)
    case 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/present-proof/1.0/presentation-result':
      proofRequestMap.get(threadId)(message.verification_result)
      break
    default:
      console.log(`Unexpected message type ${message['@type']}`)
      process.exit(1)
  }
})

module.exports = router;
