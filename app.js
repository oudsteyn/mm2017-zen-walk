const express = require('express');
const app = express();
const axios = require('axios');
const _ = require('lodash');

var access_token = '';

const uaaUrl = 'https://890407d7-e617-4d70-985f-01792d693387.predix-uaa.run.aws-usw02-pr.ice.predix.io/oauth/token';
const metadataUrl = 'https://ic-metadata-service.run.aws-usw02-pr.ice.predix.io/v2/metadata';
const eventUrl = 'https://ic-event-service.run.aws-usw02-pr.ice.predix.io/v2';

const username = 'INSERT-USER-NAME-HERE';
const passwd = 'INSERT-PASSWORD-HERE';

var now = new Date();
var endTs = now.getTime();
var startTs = now.getTime() - (60 * 15 * 1000);

app.use(express.static('public'))

app.get('/api/ping', (req, res) => {
  res.send({ message: 'pong'} );
});

app.get('/api/locationFlags/:bbox?', function (req, res) {
  var bbox = '32.715675:-117.161230,32.708498:-117.151681';
  if (req.params.bbox) {
      bbox = req.params.bbox;
  }

  getToken()
      .then(function (access_token) {
          return getLocations(access_token, bbox);
      })
      .then(function (obj) {
          access_token = obj.access_token;
          locations = obj.locations;
//             return getAssets(access_token, bbox, locations);
          return {"access_token": access_token, "locations": locations, "assets": null}
       })
       .then(function (obj2) {
          access_token = obj2.access_token;
          locations = obj2.locations;
          assets = obj2.assets;

          var resObj = {"locations":[]};
          for (i in locations) {
            if (locations[i] !== null) {
              var resLine = {};
              resLine.locationsUid = locations[i].locationUid;
              resLine.locationType = locations[i].locationType;
              var coordinates = locations[i].coordinates;
              var coords = coordinates.split(',');
              var coords1 = coords[0].split(':');
              var coords2 = coords[0].split(':');
              var lat = (parseFloat(coords1[0]) + parseFloat(coords2[0])) / 2;
              var lon = (parseFloat(coords1[1]) + parseFloat(coords2[1])) / 2
              resLine.avgLatitude = lat.toFixed(7);
              resLine.avglongitude = lon.toFixed(7);
              if (locations[i].pedestrianCount && locations[i].pedestrianCount > 30) {
                  resLine.icon = 'images/crowd.png';
                  resLine.content = '<div id="content"><div id="bodyContent">Huge crowd.  ' + locations[i].pedestrianCount + ' pedestrians detected.</div></div>';
                  resObj.locations.push(resLine);
              } else if (locations[i].pedestrianCount && locations[i].pedestrianCount > 10) {
                resLine.icon = 'images/crowd.png';
                resLine.content = '<div id="content"><div id="bodyContent">Large crowd. ' + locations[i].pedestrianCount + ' </div></div>';
                resObj.locations.push(resLine);
              } // else if (!locations[i].pedestrianCount || locations[i].pedestrianCount === 0) {
                // resLine.icon = 'images/tumbleweed.png';
                // resLine.content = '<div id="content"><div id="bodyContent">Deserted.  Nobody seen in over an hour./div></div>';
               // }

            }
          }
          res.send(resObj);



      })
      .catch(function (error) {
          console.log(error);
      })


});

function getToken() {

  return new Promise(function (resolve, reject) {
      axios.get(uaaUrl + '?grant_type=client_credentials',
          {
              auth: {
                  username: username,
                  password: passwd
              },
          })
          .then(function (response) {
              if (response.data.access_token) {
                  resolve(response.data.access_token);
              } else {
                  reject('No token');
              }
          })
          .catch(function (error) {
              reject(error);
          });
  });
}


function getLocPed(access_token, locationUid) {
return new Promise(function(resolve, reject) {
axios.get(eventUrl + '/locations/' + locationUid + '/events?eventType=PEDEVT&startTime=' + startTs + '&endTime=' + endTs,
  {
      headers: {
          "Authorization": 'Bearer ' + access_token,
          "Predix-Zone-Id": 'SDSIM-IE-PEDESTRIAN'
      }
  })
  .then(function(locationPed) {
     if (locationPed.data.metaData.totalRecords > 0) {
       var maxRec = _.maxBy(locationPed.data.content, 'measures.pedestrianCount');
       resolve({"locationUid":locationUid, "pedestrianCount":maxRec.measures.pedestrianCount});
     } else {
        resolve(null);
     }
  })
  .catch(function(error) {
      console.log(error);
      reject(error);
  })
})

}

//Limited to 20 at most.
//TODO expand to handle larger pages of data and more pages
function getLocations(access_token, bbox) {
  return new Promise(function (resolve, reject) {
      axios.get(metadataUrl + '/locations/search?q=locationType:WALKWAY&bbox=' + bbox + '&page=0&size=20',
          {
              headers: {
                  "Authorization": 'Bearer ' + access_token,
                  "Predix-Zone-Id": 'SDSIM-IE-TRAFFIC'
              }
          }
      )
          .then(function (results) {
              return new Promise(function (resolve, reject) {
                  var promises = [];
                  for (i in results.data.content) {
                      promises.push(getLocPed(access_token, results.data.content[i].locationUid));

                      Promise.all(promises)
                      .then(function(data) {

                          _.merge(results.data.content, data);
                        resolve({"access_token":access_token, "locations": results.data.content});
                      })
                      .catch(function(err) {
                          console.log(err);
                        reject(err);
                      })
                  }

          })
          .then(function (data) {
            resolve(data);
          })
          .catch(function( err) {
             console.log(err);
             resolve(err);
          })
      })
          .catch(function (error) {
              reject(error);
          })
  });
}

function getAstPed(access_token, assetUid) {
  return new Promise(function(resolve, reject) {
  axios.get(eventUrl + '/assets/' + assetUid + '/events?eventType=PEDEVT&startTime=' + startTs + '&endTime=' + endTs,
      {
          headers: {
              "Authorization": 'Bearer ' + access_token,
              "Predix-Zone-Id": 'SDSIM-IE-PEDESTRIAN'
          }
      })
      .then(function(assetPed) {
          if (assetPed.data.metaData.totalRecords > 0) {
              var maxRec = _.maxBy(assetPed.data.content, 'measures.pedestrianCount');
              resolve({"assetUid":assetUid, "pedestrianCount":maxRec.measures.pedestrianCount});
          } else {
              resolve(null);
           }
        })
        .catch(function(error) {
            console.log(error);
            reject(error);
        })
      })

}

function getAstTemp(access_token, assetUid) {
  return new Promise(function(resolve, reject) {
  axios.get(eventUrl + '/assets/' + assetUid + '/events?eventType=TEMPERATURE&startTime=' + startTs + '&endTime=' + endTs,
      {
          headers: {
              "Authorization": 'Bearer ' + access_token,
              "Predix-Zone-Id": 'SDSIM-IE-ENVIRONMENTAL'
          }
      })
      .then(function(assetPed) {
          if (assetPed.data.metaData.totalRecords > 0) {
              var maxRec = _.maxBy(assetPed.data.content, 'measures.max');
              resolve({"assetUid":assetUid, "maxTemp":maxRec.measures.max});
          } else {
              resolve(null);
           }
        })
        .catch(function(error) {
            console.log(error);
            reject(error);
        })
      })

}

function getAssets(access_token, bbox, locations) {
  return new Promise(function (resolve, reject) {
      axios.get(metadataUrl + '/assets/search?q=assetType:ENV_SENSOR&bbox=' + bbox + '&page=0&size=5',
          {
              headers: {
                  "Authorization": 'Bearer ' + access_token,
                  "Predix-Zone-Id": 'SDSIM-IE-TRAFFIC'
              }
          }
      )
          .then(function (results) {
              return new Promise(function (resolve, reject) {
                  var promises = [];
                  for (i in results.data.content) {
                      promises.push(getAstTemp(access_token, results.data.content[i].assetUid));

                      Promise.all(promises)
                      .then(function(data) {

                          _.merge(results.data.content, data);
                        resolve({"access_token":access_token, "locations": locations, "assets": results.data.content});
                      })
                      .catch(function(err) {
                          console.log(err);
                        reject(err);
                      })
                  }

          })

          })
          .catch(function (error) {
              reject(error);
          })
  });
}

const server = app.listen(process.env.PORT || 3000, function(){
  console.log('server is running at %s', server.address().port);
});
