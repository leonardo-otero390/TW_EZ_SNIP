// This script has been approved by Tribal Wars as of 27/01/2018, ticket t12168060.

(() => {
  /************************
   * GLOBALS/CONSTANTS
   */

  var LS_KEY_MANUAL_INCOMINGS = "ezs-incomings";

  window.ezsSettings = window.ezsSettings || {};

  var hashSettings = {};

  var localStorage = window.localStorage;

  var href = window.location.href;
  var villaId = /village=([^\&]+)/.exec(href);
  if (villaId) {
    villaId = villaId[1];
  }
  var sitterId = /t=(\w+)/.exec(href);
  if (sitterId) {
    sitterId = sitterId[1];
  }

  /************************
   * UTILITIES
   */

  {
    /************************
     * GENERAL
     */
    {
      function loadHashSettings() {
        window.location.hash
          .substr(1)
          .split("&")
          .forEach((entry) => {
            var key, value;
            if (entry.indexOf("=") > 0) {
              entry = entry.split("=");
              key = entry[0];
              value = entry[1];
            } else {
              key = entry;
              value = true;
            }
            hashSettings[key] = value;
          });
      }
      loadHashSettings();

      function makeSitterUrl(url) {
        if (sitterId) {
          return url + "&t=" + sitterId;
        } else {
          return url;
        }
      }

      function objForEach(obj, iterator) {
        for (var prop in obj) {
          if (!obj.hasOwnProperty(prop)) {
            continue;
          }
          iterator(obj[prop], prop);
        }
      }

      function makeTroopQueryString(troopCounts) {
        var result = [];

        troopCounts.forEach((cnt, i) => {
          if (cnt > 0) {
            result.push(TW.unitTypes[i].canonicalName);
          }
        });
        return "allowed_troops=" + result.join(",");
      }

      function deepCompare(a, b) {
        function _deepCompare(a, b) {
          for (var prop in a) {
            if (!a.hasOwnProperty(prop)) {
              continue;
            }
            if (a[prop] == b[prop]) {
              continue;
            }

            if (typeof a[prop] != typeof b[prop]) {
              return false;
            } else if (typeof a[prop] == "object") {
              if (!deepCompare(a[prop], b[prop])) {
                return false;
              }
            } else if (a[prop] != b[prop]) {
              return false;
            }
          }
          return true;
        }

        return _deepCompare(a, b) && _deepCompare(b, a);
      }

      function tcRequire(libs, onDone) {
        //console.log('Requires: ', libs);
        var numPending = 0;
        window.requestData = {};
        libs.forEach((l, i) => {
          if (l.indicator && l.indicator()) {
            //console.log(l.url + ' was already loaded');
            if (++numPending == libs.length) {
              libs.forEach((l, si) =>
                l.onLoad && (!l.indicator || !l.indicator())
                  ? l.onLoad(requestData[si])
                  : null
              );
              onDone();
            }
            return;
          }
          $.get(l.url ? l.url : l, (js) => {
            requestData[i] = js;
            //console.log('Got lib: ', l);
            if (!l.nonJs) eval(js);
            //console.log('Loaded and ran lib: ', l);
            if (++numPending == libs.length) {
              libs.forEach((l, si) =>
                l.onLoad && (!l.indicator || !l.indicator())
                  ? l.onLoad(requestData[si])
                  : null
              );
              onDone();
            }
          });
        });
      }
    }

    /************************
     * PARSING
     */
    {
      //  TODO - Replace other time parsing with this function
      function extractUserTimeInput(timeString) {
        var monthStrings = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ];

        var serverDate = $("#serverDate").text().split("/");

        var match;
        if ((match = timeString.match(/(\d+:\d+:\d+:\d+)\s+(\d+\/\d+\/\d+)/))) {
          //  Hour:Minute:Second:Ms Day/Month/Year
          return {
            time: match[1].split(":"),
            date: match[2].split("/"),
          };
        } else if (
          (match = timeString.match(/(\d+\/\d+\/\d+)\s+(\d+:\d+:\d+:\d+)/))
        ) {
          //  Day/Month/Year Hour:Minute:Second:Ms
          return {
            date: match[1].split("/"),
            time: match[2].split(":"),
          };
        } else if (
          (match = timeString.match(
            new RegExp(
              `((?:${monthStrings.join(
                "|"
              )}))\\s+(\\d+),\\s+(\\d+)\\s+(\\d+:\\d+:\\d+:\\d+)`,
              "i"
            )
          ))
        ) {
          //  (Mon.) Day, Year Hour:Minute:Second:Ms
          var monthName = match[1];
          var day = match[2];
          var year = match[3];
          var month = (
            monthStrings.indexOf(monthName.toLowerCase()) + 1
          ).toString();

          return {
            date: [day, month, year],
            time: match[4].split(":"),
          };
        } else if (
          (match = translate(INTL.T_TODAY_AT, { type: "regex" }).exec(
            timeString
          ))
        ) {
          // today at (Hours:Minute:Second:Ms)
          return {
            date: serverDate,
            time: match[1].split(":"),
          };
        } else if (
          (match = translate(INTL.T_TOMORROW_AT, { type: "regex" }).exec(
            timeString
          ))
        ) {
          // tomorrow at (Hours:Minute:Second:Ms)
          return {
            date: [
              (parseInt(serverDate[0]) + 1).toString(),
              parseInt(serverDate[1]).toString(),
              serverDate[2],
            ],
            time: match[1].split(":"),
          };
        } else if (
          (match = translate(INTL.T_ON_AT, { type: "regex" }).exec(timeString))
        ) {
          // on (Day/Month/Year) at (Hours:Minute:Second:Ms)
          return {
            date: match[1].split("/"),
            time: match[2].split(":"),
          };
        } else {
          return null;
        }
      }

      // Unused at the moment, meant for parsing SOS copy/paste
      function parseTextInput(textInput) {
        // incomings.push({
        //     origin: origin,
        //     destination: destination,
        //     arrival: arrival
        // });

        let STATES = {
          INTRO,
          PARSED_VILLAGE,
          PARSED_WALL,
          PARSED_DEFENDER,
          PARSED_INCOMING_ENTRY,
        };

        var incomings = [];
        var state = STATES.INTRO;

        var x = {};

        textInput.split().forEach((l, i) => {
          l = l.trim();
          var match, villageName, landingDate, landingTime, landsAt;

          if (l.length == 0) {
            return;
          }

          if ((match = l.match(/Village\:([\w\s])+\(\.+\ K\d+\)/i))) {
            match = match[0];
            x.villageText = match;
            state = STATES.PARSED_VILLAGE;
            landingDate = null;
            landingTime = null;
          } else if (
            (match = l.match(/(\w+\s+\d+,?\s+\d+)\s+(\d+:\d+:\d+(?:\d+))/i))
          ) {
            landingDate = match[1];
            landingTime = match[2].split(":");

            landsAt = new Date(Date.parse(landingDate));
            landsAt.setUTCHours(parseInt(landingTime[0]));
            landsAt.setUTCMinutes(parseInt(landingTime[1]));
            landsAt.setUTCSeconds(parseInt(landingTime[2]));

            if (landingTime.length == 4) {
              landsAt.setUTCMilliseconds(parseInt(landingTime[1]));
            }
          }

          var match;
          switch (state) {
            case STATES.INTRO:
              match = l.match(/Village\:([\w\s]+)\(\.+\ K\d+\)/i);
              if (match) {
                match = match[0];
                x.villageText = match;
                state = STATES.PARSED_VILLAGE;
              }
              break;
            case STATES.PARSED_VILLAGE:
              match = l.match(/ /);
              break;
            case STATES.PARSED_WALL:
              break;
            case STATES.PARSED_DEFENDER:
              break;
            case STATES.PARSED_INCOMING_ENTRY:
              break;
          }
        });
      }

      function parseOverviewVillaRows($rows) {
        var villas = [];
        $rows.each((i, el) => {
          var $el = $(el);

          var $villaLink = $el.find(".quickedit-vn a:first-of-type");
          var villaUrl = $villaLink.prop("href");
          var villaName = $villaLink.text().trim();
          var villaCoord = /(\d+\|\d+)/.exec(villaName)[1];

          var $availInVillaRow = $el.find("tr:nth-child(1) td.unit-item");
          var availTroopsInVilla = [];
          $availInVillaRow.each((i, el) =>
            availTroopsInVilla.push(parseInt($(el).text()))
          );

          var $troopsInVillaRow = $el.find("tr:nth-child(2) td.unit-item");
          var troopCountsInVilla = [];
          $troopsInVillaRow.each((i, el) =>
            troopCountsInVilla.push(parseInt($(el).text()))
          );

          var currentId = /village=([\w\d]+)/.exec(villaUrl)[1];
          villas.push({
            id: currentId,
            link: villaUrl,
            name: villaName,
            rallyPointLink: makeSitterUrl(
              `${window.location.host}/game.php?village=${currentId}&screen=place`
            ),
            coordText: villaCoord,
            troopsInVilla: troopCountsInVilla,
            ownTroopsInVilla: availTroopsInVilla,
            coord: {
              x: parseInt(villaCoord.split("|")[0]),
              y: parseInt(villaCoord.split("|")[1]),
            },
          });
        });
        return villas;
      }
    }

    /************************
     * VILLAGE DATA
     */
    {
      function getVillageDataById(villageId, callback) {
        var url = `/game.php?screen=info_village&id=${villageId}`;

        $.get(url, (data) => {
          var $doc = $(data);
          var name = $doc.find("#content_value > h2").text();
          var coord = $doc
            .find(
              "table.vis:nth-child(1) tr:nth-of-type(3) td:nth-of-type(2):first"
            )
            .text()
            .trim();
          console.log(name);
          console.log(coord);
          if (!name || !coord) {
            alert(
              "Village with ID " +
                villa.id +
                " does not exist! (Or the script is broken..)"
            );
            return;
          }

          var villa = {};
          villa.coordText = coord;
          villa.name = name;
          villa.coord = {
            x: parseInt(coord.split("|")[0]),
            y: parseInt(coord.split("|")[1]),
          };

          callback(villa);
        });
      }

      function findVillaByCoord(villas, coord) {
        var result = null;
        villas.forEach((v) =>
          v.coord.x == coord.x && v.coord.y == coord.y ? (result = v) : null
        );
        return result;
      }
    }

    /************************
     * CONFIGURATION
     */
    {
      function toggleArchers(useArchers) {
        window.worldHasArchers = useArchers;

        var archerUnit = TW.unitTypes.filter((t) => t.name == "Archer");
        var marcherUnit = TW.unitTypes.filter((t) => t.name == "Mounted Ar.");
        if (archerUnit) archerUnit = archerUnit[0];
        if (marcherUnit) marcherUnit = marcherUnit[0];

        if (!useArchers && archerUnit) {
          console.log(
            "World has archers disabled, removing archers from parser"
          );
          TW.unitTypes.splice(3, 1);
          TW.unitTypes.splice(5, 1);
        }
      }

      function togglePaladin(usePaladin) {
        window.worldHasPaladin = usePaladin;

        var paladinUnit = TW.unitTypes.filter((t) => t.name == "Paladin");
        if (paladinUnit) paladinUnit = paladinUnit[0];
      }
    }

    /************************
     * SNIPE/TROOP CALCULATIONS
     */
    {
      function calculateWalkTime(unitType, sourceCoord, destCoord) {
        var dist = Math.sqrt(
          Math.pow(sourceCoord.x - destCoord.x, 2) +
            Math.pow(sourceCoord.y - destCoord.y, 2)
        );
        return (dist * unitType.travelSpeed) / TW.gameSpeed / TW.unitSpeed;
      }

      function calculateTroopStatsByUnitSpeed(
        unitCounts,
        baseUnitType,
        build_
      ) {
        var paladinIndex = 10;
        var hasPaladin = unitCounts[paladinIndex] > 0;
        var result = {
          totalPop: 0,
          totalInfDef: 0,
          totalCavDef: 0,
          totalArDef: 0,
          walkTime: 0,
        };
        unitCounts.forEach((cnt, i) => {
          var unit = TW.unitTypes[i];

          if (build_ && unit.build != build_) {
            return;
          }

          if (
            unit.travelSpeed > baseUnitType.travelSpeed &&
            baseUnitType.name != "Paladin"
          ) {
            return;
          }

          result.totalPop += unit.population * cnt;
          result.totalInfDef += unit.defense[0].value * cnt;
          result.totalCavDef += unit.defense[1].value * cnt;
          result.totalArDef += unit.defense[2].value * cnt;

          var unitSpeed = unit.travelSpeed;
          if (hasPaladin) {
            unitSpeed = TW.unitTypes[paladinIndex].travelSpeed;
          }

          var walkTime = unit.travelSpeed / TW.gameSpeed / TW.unitSpeed;
          if (walkTime > result.walkTime) {
            result.walkTime = walkTime;
          }
        });
        result.totalDef =
          result.totalInfDef + result.totalCavDef + result.totalArDef;
        return result;
      }

      function makeSnipePermutations(currentTime, sourceVillas, incomings) {
        var snipeOptions = [];

        sourceVillas.forEach((vil, vi) => {
          incomings.forEach((inc, ii) => {
            if (inc.destination == vil) {
              return;
            }

            var fastestDefUnitSpeed = 999;
            TW.unitTypes.forEach((t, i) => {
              if (
                vil.ownTroopsInVilla[i] &&
                t.travelSpeed < fastestDefUnitSpeed &&
                t.name != "Scout"
              ) {
                fastestDefUnitSpeed = t.travelSpeed;
              }
            });

            vil.ownTroopsInVilla.forEach((cnt, ti) => {
              if (!cnt) {
                return;
              }

              //  Doesn't make sense to base a snipe off of a very fast, non-defensive unit (other def units can't keep up with it)
              var unitType = TW.unitTypes[ti];
              if (unitType.travelSpeed < fastestDefUnitSpeed) {
                return;
              }

              var SECONDS = 1 / 60;
              var MINUTES = 1;
              var HOURS = 60;
              var DAYS = 1440;

              var travelTimeMinutes = calculateWalkTime(
                unitType,
                vil.coord,
                inc.destination.coord
              );
              if (inc.destination.speedModifier) {
                travelTimeMinutes /= 1 + inc.destination.speedModifier;
              }
              var travelTimeParts = {};
              travelTimeParts.days = Math.floor(travelTimeMinutes / DAYS);
              travelTimeMinutes -= travelTimeParts.days * DAYS;
              travelTimeParts.hours = Math.floor(travelTimeMinutes / HOURS);
              travelTimeMinutes -= travelTimeParts.hours * HOURS;
              travelTimeParts.minutes = Math.floor(travelTimeMinutes / MINUTES);
              travelTimeMinutes -= travelTimeParts.minutes * MINUTES;
              travelTimeParts.seconds = Math.round(travelTimeMinutes / SECONDS);

              var launchTime = new Date(inc.arrival);
              launchTime.setUTCDate(
                launchTime.getUTCDate() - travelTimeParts.days
              );
              launchTime.setUTCHours(
                launchTime.getUTCHours() - travelTimeParts.hours
              );
              launchTime.setUTCMinutes(
                launchTime.getUTCMinutes() - travelTimeParts.minutes
              );
              launchTime.setUTCSeconds(
                launchTime.getUTCSeconds() - travelTimeParts.seconds
              );

              var hoursToMs = 60 * 60 * 1000;
              var timeUntilLaunch =
                launchTime.valueOf() - currentTime.valueOf();
              if (
                timeUntilLaunch < 0 ||
                timeUntilLaunch > ezsSettings.maximumTimeUntilLaunch * hoursToMs
              ) {
                return;
              }

              snipeOptions.push({
                unitType: unitType,
                sourceVillageData: vil,
                targetVillageData: inc.destination,
                launchTime: launchTime,
                arrivalTime: inc.arrival,
                travelTime: travelTimeParts,
              });
            });
          });
        });

        return snipeOptions;
      }

      function makeBasicSnipeBuild(snipeOptions) {
        var maxSpeed = snipeOptions.unitType.travelSpeed;

        //  Select indices of available defensive troop types
        var allowedUnits = [];
        var totalAvailPop = snipeOptions.stats.totalPop;
        var totalAllowedPop = 0;
        TW.unitTypes.forEach((type, i) => {
          if (
            snipeOptions.unitType.name != "Paladin" &&
            type.name == "Paladin"
          ) {
            //  Don't include paladin if it wasn't specifically chosen for the snipe
            return;
          } else if (
            snipeOptions.unitType.name == "Paladin" &&
            type.build == "Offensive" &&
            !ezsSettings.offensiveSnipes
          ) {
            // Don't include offensive units if we're sending paladin
            return;
          }
          //  Ignore speed limits if paladin is being sent with snipe
          if (
            snipeOptions.sourceVillageData.ownTroopsInVilla[i] > 0 &&
            (type.travelSpeed <= snipeOptions.unitType.travelSpeed ||
              snipeOptions.unitType.name == "Paladin")
          ) {
            totalAllowedPop +=
              snipeOptions.sourceVillageData.ownTroopsInVilla[i] *
              type.population;
            allowedUnits.push(i);
          }
        });

        // var popUsed = Math.max(ezsSettings.minimumSnipePopulation, totalAllowedPop);
        // popUsed = Math.min(ezsSettings.targetSnipePopulation, popUsed);
        // var percent = popUsed / totalAllowedPop;
        // percent = Math.min(percent, 1);
        var percent = 0;

        var numUnits = [];
        snipeOptions.sourceVillageData.ownTroopsInVilla.forEach((cnt, i) => {
          if (allowedUnits.indexOf(i) < 0) {
            numUnits.push(0);
            return;
          }

          if (
            TW.unitTypes[i].build == "Offensive" &&
            !ezsSettings.offensiveSnipes
          ) {
            if (TW.unitTypes[i] != snipeOptions.unitType) {
              numUnits.push(0);
            } else {
              numUnits.push(1);
            }
            return;
          }

          var singleUnitCount = cnt * percent;
          singleUnitCount = Math.floor(singleUnitCount);
          if (singleUnitCount == 0) {
            singleUnitCount = 1;
          }
          numUnits.push(singleUnitCount);
        });

        return numUnits;
      }
    }

    /************************
     * LOCAL STORAGE
     */
    {
      function getManualIncomings() {
        var manualIncomings =
          JSON.parse(localStorage.getItem(LS_KEY_MANUAL_INCOMINGS)) || [];
        manualIncomings.forEach(
          (inc) => (inc.arrival = new Date(Date.parse(inc.arrival)))
        );
        return manualIncomings;
      }

      function saveManualIncoming(inc) {
        var manualIncomings = getManualIncomings();
        manualIncomings.push(inc);
        localStorage.setItem(
          LS_KEY_MANUAL_INCOMINGS,
          JSON.stringify(manualIncomings)
        );
      }

      function deleteManualIncoming(inc) {
        var manualIncomings = getManualIncomings();
        var bestMatchIdx = -1;
        manualIncomings.forEach((saved, i) => {
          if (deepCompare(inc, saved)) {
            bestMatchIdx = i;
          }
        });

        if (bestMatchIdx < 0) {
          console.warn(
            "Couldn't find an incoming in localStorage matching the deleted incoming"
          );
          return;
        }
        manualIncomings.splice(bestMatchIdx, 1);
        localStorage.setItem(
          LS_KEY_MANUAL_INCOMINGS,
          JSON.stringify(manualIncomings)
        );
      }

      function initLocalStorage() {
        if (!localStorage.getItem(LS_KEY_MANUAL_INCOMINGS)) {
          localStorage.setItem(LS_KEY_MANUAL_INCOMINGS, JSON.stringify([]));
        }
      }
    }

    /************************
     * BB-CODE
     */
    {
      function makeBbCodeTable(headers, data, maxBrackets_) {
        var result = [];
        result.push(`[table]`);

        maxBrackets_ = maxBrackets_ || 99999999;

        var numBrackets = 3;
        result.push(`[**]${headers.join("[||]")}[/**]`);
        data.forEach((row) => {
          if (numBrackets >= maxBrackets_) return;

          var line = `[*]${row.join(" [|] ")}`;
          numBrackets += line.match(/\[/g).length;
          result.push(line);
        });
        result.push("[/table]");
        return result.join("\n");
      }

      function splitSnipesForBbcodeLimit(snipes) {
        var snipesPerPage = 50; // approximate
        var splitSnipes = [];
        var currentPage = [];
        snipes.forEach((s) => {
          if (currentPage.length == snipesPerPage) {
            splitSnipes.push(currentPage);
            currentPage = [];
          }
          currentPage.push(s);
        });
        if (currentPage.length) {
          splitSnipes.push(currentPage);
        }
        return splitSnipes;
      }

      function makeTroopsList(troopCounts, useIcons, useNewlines_) {
        var result = [];
        var labels = [
          "spear",
          "sword",
          "axe",
          "archer",
          "spy",
          "light",
          "marcher",
          "heavy",
          "ram",
          "catapult",
          "knight",
          "snob",
        ];
        if (!worldHasArchers) {
          labels.splice(3, 1);
          labels.splice(5, 1);
        }
        labels.forEach((lbl, i) => {
          if (!troopCounts[i]) {
            return;
          }
          //result.push(`${troopCounts[i]} [unit]${lbl}[/unit]`);
          if (useIcons) {
            result.push(`[unit]${lbl}[/unit]`);
          } else {
            result.push(translate(INTL.M_TROOP_SHORTHAND_NAMES, { entry: i }));
          }
        });

        if (useNewlines_) {
          return result.join("\n");
        } else {
          if (useIcons) {
            return result.join(" ");
          } else {
            return result.join(", ");
          }
        }
      }

      function makeBbCodeOutput($container, displayType, currentTime, snipes) {
        var isCompact = $("#ezs-use-compact").prop("checked");
        var useIcons = $("#ezs-use-icons").prop("checked");
        console.log("isCompact = ", isCompact);
        console.log("useIcons = ", useIcons);
        var orderedSnipes = snipes.slice();
        orderedSnipes.sort(
          (a, b) =>
            a.schedule.launchTime.valueOf() - b.schedule.launchTime.valueOf()
        );

        var formatNumber = (num) =>
          num.toString().length == 1 ? "0" + num.toString() : num.toString();

        function formatTravelTime(time) {
          return `${formatNumber(time.days)}:${formatNumber(
            time.hours
          )}:${formatNumber(time.minutes)}:${formatNumber(time.seconds)}`;
        }

        function formatDateTime(dateTime) {
          var utcDay = dateTime.getUTCDate();
          var utcMonth = dateTime.getUTCMonth() + 1;
          var utcYear = dateTime.getUTCFullYear();

          var utcHour = dateTime.getUTCHours();
          var utcMinute = dateTime.getUTCMinutes();
          var utcSecond = dateTime.getUTCSeconds();

          var utcMillisecond = dateTime.getUTCMilliseconds().toString();
          while (utcMillisecond.length < 3) {
            utcMillisecond = "0" + utcMillisecond;
          }

          return `${formatNumber(utcHour)}:${formatNumber(
            utcMinute
          )}:${formatNumber(utcSecond)}:${formatNumber(
            utcMillisecond
          )} ${formatNumber(utcDay)}/${formatNumber(utcMonth)}/${formatNumber(
            utcYear
          )}`;
        }

        //  Attempt to respect the max-brackets limit of 1000
        function trimLinesByBbcodeLimit(lines) {
          var maxBrackets = 1000;
          var totalBrackets = 0;
          for (var i = 0; i < lines.length; i++) {
            totalBrackets += (lines[i].match(/\[/g) || []).length;
            if (totalBrackets >= maxBrackets) {
              --i;
              break;
            }
          }

          return lines.slice(0, i + 1);
        }

        var textareaStyle = "width:500px;height:200px;";

        var endTime = new Date(currentTime);
        endTime.setUTCHours(
          endTime.getUTCHours() + ezsSettings.maximumTimeUntilLaunch
        );
        var timeRange = translate(INTL.T_SNIPE_TIME_RANGE, {
          currentTime: formatDateTime(currentTime),
          endTime: formatDateTime(endTime),
        });

        var $textarea = $(`<textarea style="${textareaStyle}">`);
        $container.append($textarea);

        switch (displayType) {
          case "source":
            makeSourceOutput($textarea);
            break;
          case "destination":
            makeDestinationOutput($textarea);
            break;
          case "all":
            makeAllOutput($textarea);
            break;
        }

        function makeSourceOutput($target) {
          var lines = [];

          var sourceVillageSnipes = [];
          orderedSnipes.forEach((s) => {
            var snipeData = null;
            sourceVillageSnipes.forEach((svs) => {
              if (
                snipeData == null &&
                svs.source == s.schedule.sourceVillageData
              ) {
                snipeData = svs;
              }
            });

            if (snipeData == null) {
              snipeData = {
                source: s.schedule.sourceVillageData,
                snipes: [],
              };
              sourceVillageSnipes.push(snipeData);
            }

            snipeData.snipes.push(s);
          });

          console.log("Organized by source: ", sourceVillageSnipes);

          lines.push(timeRange);

          sourceVillageSnipes.forEach((vs) => {
            var source = vs.source;
            var snipes = vs.snipes;

            var headerFormat;
            if (isCompact) {
              headerFormat = [
                translate(INTL.T_TARGET),
                translate(INTL.T_LAUNCH_TIME),
                translate(INTL.T_LANDS_AT),
                translate(INTL.T_TROOP_REQ),
              ];
            } else {
              headerFormat = [
                "#",
                translate(INTL.T_TARGET),
                translate(INTL.T_LAUNCH_TIME),
                translate(INTL.T_LANDS_AT),
                "",
                translate(INTL.T_TROOPS),
              ];
            }

            var headerText = `${translate(INTL.T_SNIPES_FROM_SRC, {
              source: source.coordText,
            })} (${snipes.length})`;
            if (isCompact) {
              lines.push(headerText);
            } else {
              lines.push(`[b]${headerText}[/b]`);
            }
            lines.push(
              makeBbCodeTable(
                headerFormat,
                snipes.map((s, i) => {
                  var row = [];
                  if (!isCompact) {
                    row.push(i + 1 + ".");
                  }

                  // https://en96.tribalwars.net/game.php?village=35509&screen=place&from=simulator&att_snob=558&target_village_id=30285&target=30285
                  row.push(
                    `[url=${
                      s.schedule.sourceVillageData.rallyPointLink
                    }&from=simulator&att_${
                      s.schedule.unitType.canonicalName
                    }=1&target_village_id=${
                      s.schedule.targetVillageData.id
                    }&${makeTroopQueryString(s.units)}]${
                      s.schedule.targetVillageData.name
                    }[/url]`
                  );

                  row.push(formatDateTime(s.schedule.launchTime));
                  row.push(formatDateTime(s.schedule.arrivalTime));

                  if (useIcons) {
                    row.push(
                      `[unit]${s.schedule.unitType.canonicalName}[/unit]`
                    );
                  } else {
                    row.push(
                      translate(INTL.M_TROOP_COMMON_NAMES, {
                        entry: TW.unitTypes.indexOf(s.schedule.unitType),
                      })
                    );
                  }

                  if (!isCompact) {
                    row.push(makeTroopsList(s.units, useIcons));
                  }
                  return row;
                })
              )
            );
          });

          $target.val(lines.join("\n"));
        }

        function makeDestinationOutput($target) {
          var lines = [];

          lines.push(timeRange);

          var destVillageSnipes = [];
          orderedSnipes.forEach((s) => {
            var snipeData = null;
            destVillageSnipes.forEach((svs) => {
              if (
                snipeData == null &&
                svs.target == s.schedule.targetVillageData
              ) {
                snipeData = svs;
              }
            });

            if (snipeData == null) {
              snipeData = {
                target: s.schedule.targetVillageData,
                snipes: [],
              };
              destVillageSnipes.push(snipeData);
            }

            snipeData.snipes.push(s);
          });

          console.log("Organized by destination: ", destVillageSnipes);

          destVillageSnipes.forEach((vs) => {
            var target = vs.target;
            var snipes = vs.snipes;

            var headerFormat;
            if (isCompact) {
              headerFormat = [
                translate(INTL.T_SOURCE),
                translate(INTL.T_LAUNCH_TIME),
                translate(INTL.T_LANDS_AT),
                translate(INTL.T_TROOP_REQ),
              ];
            } else {
              headerFormat = [
                "#",
                translate(INTL.T_SOURCE),
                translate(INTL.T_LAUNCH_TIME),
                translate(INTL.T_LANDS_AT),
                "",
                translate(INTL.T_TROOPS),
              ];
            }

            var headerText = `${translate(INTL.T_SNIPES_TO_DST, {
              target: target.coordText,
            })} (${snipes.length})`;
            if (isCompact) {
              lines.push(headerText);
            } else {
              lines.push(`[b]${headerText}[/b]`);
            }
            lines.push(
              makeBbCodeTable(
                headerFormat,
                snipes.map((s, i) => {
                  var row = [];

                  if (!isCompact) {
                    row.push(i + 1 + ".");
                  }

                  row.push(
                    `[url=${
                      s.schedule.sourceVillageData.rallyPointLink
                    }&from=simulator&att_${
                      s.schedule.unitType.canonicalName
                    }=1&target_village_id=${
                      s.schedule.targetVillageData.id
                    }&${makeTroopQueryString(s.units)}]${
                      s.schedule.sourceVillageData.name
                    }[/url]`
                  );

                  row.push(formatDateTime(s.schedule.launchTime));
                  row.push(formatDateTime(s.schedule.arrivalTime));

                  if (useIcons) {
                    row.push(
                      `[unit]${s.schedule.unitType.canonicalName}[/unit]`
                    );
                  } else {
                    row.push(
                      translate(INTL.M_TROOP_COMMON_NAMES, {
                        entry: TW.unitTypes.indexOf(s.schedule.unitType),
                      })
                    );
                  }

                  if (!isCompact) {
                    row.push(makeTroopsList(s.units, useIcons));
                  }
                  return row;
                })
              )
            );
          });

          $target.val(lines.join("\n"));
        }

        function makeAllOutput($target) {
          var lines = [];

          lines.push(timeRange);

          if (!isCompact) {
            lines.push(`[b]${translate(INTL.T_ALL_SNIPES)}[/b]`);
          }

          var headerFormat;
          if (isCompact) {
            headerFormat = [
              translate(INTL.T_SOURCE_VILLA),
              translate(INTL.T_LAUNCH_TIME),
              translate(INTL.T_LANDS_AT),
              translate(INTL.T_TROOP_REQ),
            ];
          } else {
            headerFormat = [
              "#",
              translate(INTL.T_SOURCE_VILLA),
              translate(INTL.T_LAUNCH_TIME),
              translate(INTL.T_LANDS_AT),
              "",
              translate(INTL.T_TROOPS),
            ];
          }

          lines.push(
            makeBbCodeTable(
              headerFormat,
              orderedSnipes.map((s, i) => {
                var row = [];
                if (!isCompact) {
                  row.push(i + 1 + ".");
                }

                row.push(
                  `[url=${
                    s.schedule.sourceVillageData.rallyPointLink
                  }&from=simulator&att_${
                    s.schedule.unitType.canonicalName
                  }=1&target_village_id=${
                    s.schedule.targetVillageData.id
                  }&${makeTroopQueryString(s.units)}]${
                    s.schedule.sourceVillageData.name
                  }[/url]`
                );

                row.push(
                  formatDateTime(s.schedule.launchTime),
                  formatDateTime(s.schedule.arrivalTime)
                );

                if (!useIcons) {
                  row.push(
                    translate(INTL.M_TROOP_COMMON_NAMES, {
                      entry: TW.unitTypes.indexOf(s.schedule.unitType),
                    })
                  );
                } else {
                  row.push(`[unit]${s.schedule.unitType.canonicalName}[/unit]`);
                }

                if (!isCompact) {
                  row.push(makeTroopsList(s.units, useIcons));
                }

                return row;
              })
            )
          );

          $textarea.val(lines.join("\n"));
        }
      }
    }
  }

  /************************
   * TRANSLATIONS
   */

  {
    var INTL = {
      T_LOADING_SCRIPT: 0,
      T_LOADING_ENHANCER: 0,
      T_RUN_ON_INCOMINGS: 0,
      T_NO_INCS_SELECTED: 0,

      T_MAKE_SNIPES_CHECK_SIGILS: 0,

      T_INCOMING_SUPPORT_BUFF: 0,
      T_TODAY_AT: 0,
      T_TOMORROW_AT: 0,
      T_ON_AT: 0,

      T_BB_CODE: 0,

      T_DISPLAY: 0,
      T_SNIPE: 0,
      T_OPTIONS: 0,
      T_OPTIONS_SNIPE: 0,
      T_NUM_SNIPES_MADE: 0,
      T_REFRESH_1: 0,
      T_REFRESH_2: 0,

      T_COMPACT_MODE: 0,
      T_USE_TROOP_ICONS: 0,

      T_MINIMUM_SNIPE_DEF: 0,
      T_USE_OFFENSIVE_SNIPES: 0,
      T_MAX_LAUNCH_TIME: 0,

      T_ANTI_INFANTRY: 0,
      T_ANTI_CAVALRY: 0,
      T_ANTI_ARCHER: 0,

      T_BY_DST_VILLA: 0,
      T_BY_SRC_VILLA: 0,
      T_ALL: 0,

      T_SNIPES_FROM_SRC: 0,
      T_SNIPES_TO_DST: 0,
      T_ALL_SNIPES: 0,
      T_SNIPE_TIME_RANGE: 0,
      T_TARGET: 0,
      T_SOURCE: 0,
      T_SOURCE_VILLA: 0,
      T_TARGET_VILLA: 0,
      T_LAUNCH_TIME: 0,
      T_LANDS_AT: 0,
      T_TROOP_REQ: 0,
      T_TROOPS: 0,

      M_TROOP_COMMON_NAMES: 0,
      M_TROOP_SHORTHAND_NAMES: 0,
    };

    objForEach(INTL, (val, prop) => {
      INTL[prop] = prop;
    });

    // Translations for script text
    var translations = {};

    translations.en = (() => {
      var en = {};

      en[INTL.T_ALL] = "All";
      en[INTL.T_ALL_SNIPES] = "All Snipes";
      en[INTL.T_BB_CODE] = "BB-code";
      en[INTL.T_BY_DST_VILLA] = "By Target Village";
      en[INTL.T_BY_SRC_VILLA] = "By Source Village";
      en[INTL.T_COMPACT_MODE] = "Compact Mode";
      en[INTL.T_LANDS_AT] = "Landing Time";
      en[INTL.T_LAUNCH_TIME] = "Launch Time";
      en[INTL.T_LOADING_ENHANCER] = "Loading notebook enhancer...";
      en[INTL.T_LOADING_SCRIPT] = "Loading EZ-Snipe...";
      en[INTL.T_MAKE_SNIPES_CHECK_SIGILS] =
        "Making snipes and checking for sigils...";
      en[INTL.T_NO_INCS_SELECTED] = "No incomings were selected for sniping!";
      en[INTL.T_RUN_ON_INCOMINGS] =
        "This script needs to be ran on the Incomings page, I'll bring you there now.";
      en[INTL.T_SNIPE_TIME_RANGE] =
        "Snipes between {{currentTime}} and {{endTime}}";
      en[INTL.T_SNIPES_FROM_SRC] = "Snipes from {{source}}";
      en[INTL.T_SNIPES_TO_DST] = "Snipes to {{target}}";
      en[INTL.T_TARGET] = "Target";
      en[INTL.T_TARGET_VILLA] = "Target Village";
      en[INTL.T_SOURCE] = "Source";
      en[INTL.T_SOURCE_VILLA] = "Source Village";
      en[INTL.T_TROOP_REQ] = "Troop Req.";
      en[INTL.T_TROOPS] = "Troops";
      en[INTL.T_USE_TROOP_ICONS] = "Use Troop Icons";

      //  IN-GAME TEXT - MUST MATCH EXACTLY
      en[INTL.T_INCOMING_SUPPORT_BUFF] =
        "Incoming support sent while this is active will travel {{perc}}% faster";
      en[INTL.T_TODAY_AT] = "today at {{time}}";
      en[INTL.T_TOMORROW_AT] = "tomorrow at {{time}}";
      en[INTL.T_ON_AT] = "on {{date}} at {{time}}";

      en[INTL.T_OPTIONS] = "Display Options";
      en[INTL.T_OPTIONS_SNIPE] = "Snipe Options";
      en[INTL.T_DISPLAY] = "Display: ";
      en[INTL.T_SNIPE] = "Snipe";
      en[INTL.T_MINIMUM_SNIPE_DEF] = "Minimum Snipe Def.";
      en[INTL.T_USE_OFFENSIVE_SNIPES] = "Offensive Snipes";
      en[INTL.T_MAX_LAUNCH_TIME] = "Max Hours Until Launch";
      en[INTL.T_NUM_SNIPES_MADE] = "{{count}} snipes made";
      en[INTL.T_REFRESH_1] =
        "This script will not update when you check/uncheck incomings below!";
      en[INTL.T_REFRESH_2] =
        "Run the script again to update with those changes.";

      en[INTL.T_ANTI_INFANTRY] = "anti-infantry";
      en[INTL.T_ANTI_CAVALRY] = "anti-cavalry";
      en[INTL.T_ANTI_ARCHER] = "anti-archer";

      en[INTL.M_TROOP_COMMON_NAMES] = [
        "Spear",
        "Sword",
        "Axe",
        "Archer",
        "Scout",
        "Light Cav.",
        "Mounted Ar.",
        "Heavy Cav.",
        "Ram",
        "Catapult",
        "Paladin",
        "Nobleman",
      ];

      en[INTL.M_TROOP_SHORTHAND_NAMES] = [
        "sp",
        "sw",
        "axe",
        "ar",
        "sc",
        "lc",
        "ma",
        "hc",
        "ram",
        "cat",
        "pally",
        "noble",
      ];

      return en;
    })();

    translations.br = (() => {
      var br = {};

      br[INTL.T_ALL] = "Tudo";
      br[INTL.T_ALL_SNIPES] = "Todos os snips";
      br[INTL.T_BB_CODE] = "CÃ³digo BB";
      br[INTL.T_BY_DST_VILLA] = "Por aldeia alvo";
      br[INTL.T_BY_SRC_VILLA] = "Por aldeia fonte";
      br[INTL.T_COMPACT_MODE] = "Modo compacto";
      br[INTL.T_LANDS_AT] = "Hora de chegada";
      br[INTL.T_LAUNCH_TIME] = "Hora de envio";
      br[INTL.T_LOADING_ENHANCER] =
        "Carregando potenciador de bloco de notas...";
      br[INTL.T_LOADING_SCRIPT] = "Carregando EZ-Snipe...";
      br[INTL.T_MAKE_SNIPES_CHECK_SIGILS] =
        "Fazendo snips e procurando por sigilos...";
      br[INTL.T_NO_INCS_SELECTED] = "Nenhum ataque foi selecionado para snip!";
      br[INTL.T_RUN_ON_INCOMINGS] =
        "Este script precisa ser executado na pÃ¡gina Chegando, vou trazer Ã  vocÃª agora";
      br[INTL.T_SNIPE_TIME_RANGE] = "Snips entre {{currentTime}} e {{endTime}}";
      br[INTL.T_SNIPES_FROM_SRC] = "Snips a partir de {{source}}";
      br[INTL.T_SNIPES_TO_DST] = "Snips para {{target}}";
      br[INTL.T_TARGET] = "Alvo";
      br[INTL.T_TARGET_VILLA] = "Aldeia alvo";
      br[INTL.T_SOURCE] = "Fonte";
      br[INTL.T_SOURCE_VILLA] = "Aldeia fonte";
      br[INTL.T_TROOP_REQ] = "Tropa necessária";
      br[INTL.T_TROOPS] = "Tropas";
      br[INTL.T_USE_TROOP_ICONS] = "Usar ícones de tropas";

      br[INTL.T_OPTIONS] = "Opções";
      br[INTL.T_OPTIONS_SNIPE] = "Opções de snipe";
      br[INTL.T_INCOMING_SUPPORT_BUFF] =
        "Apoio recebido enquanto isso estiver ativo vai viajar {{perc}}% mais rÃ¡pido";
      br[INTL.T_TODAY_AT] = "Hoje Ã s {{time}}";
      br[INTL.T_TOMORROW_AT] = "AmanhÃ£ Ã s {{time}}";
      br[INTL.T_ON_AT] = "Em {{date}} Ã s {{time}}";

      br[INTL.T_SNIPE] = "Snips";
      br[INTL.T_MINIMUM_SNIPE_DEF] = "Snipe Def. Mínimo";
      br[INTL.T_USE_OFFENSIVE_SNIPES] = "Snipes Ofensivo";
      br[INTL.T_DISPLAY] = "Mostrar";
      br[INTL.T_MAX_LAUNCH_TIME] = "Hora máxima até o lançamento";
      br[INTL.T_NUM_SNIPES_MADE] = "{{count}} snips gerados";
      br[INTL.T_ANTI_INFANTRY] = "anti-infantaria";
      br[INTL.T_ANTI_CAVALRY] = "anti-cavalaria";
      br[INTL.T_ANTI_ARCHER] = "anti-arqueiro";
      br[INTL.T_REFRESH_1] =
        "Este script não será atualizado quando você marcar/desmascar as entradas abaixo.";
      br[INTL.T_REFRESH_2] =
        "Rode o script novamente para atualizar com aquelas mudanças.";

      br[INTL.M_TROOP_COMMON_NAMES] = [
        "Lanceiro",
        "Espadachim",
        "Bárbaro",
        "Arqueiro",
        "Explorador",
        "Cavalaria Leve",
        "Arqueiro à cavalo",
        "Cavalaria Pesada",
        "Aríete",
        "Catapulta",
        "Paladino",
        "Nobre",
      ];

      br[INTL.M_TROOP_SHORTHAND_NAMES] = [
        "lança",
        "esp",
        "bb",
        "arc",
        "expl",
        "cl",
        "arc cav",
        "cp",
        "aríete",
        "cata",
        "pala",
        "nobre",
      ];

      return br;
    })();

    function translate(messageCode, args) {
      // Detect 'RAW' requests for translation debugging
      if (args && args == "RAW") {
        return translations.en[messageCode];
      }

      // Shared translations
      translations.us = translations.en;
      translations.uk = translations.en;
      translations.enc = translations.en;

      serverName = hashSettings["lang"] || serverName.match(/([^\d]+)/)[1];

      var dictionary;
      if (!dictionary && customTranslations) {
        dictionary = customTranslations[serverName];
      }
      if (!dictionary) {
        dictionary = translations[serverName];
      }
      if (!dictionary) {
        console.log(
          `Tried to translate ${messageCode} but server ${serverName} is not supported`
        );
        debugger;
        return messageCode;
      }

      if (
        !dictionary.checkedArchers &&
        typeof window.worldHasArchers !== "undefined" &&
        window.worldHasArchers
      ) {
        objForEach(dictionary, (v, p) =>
          v instanceof Array ? v.splice(3, 1) && v.splice(5, 1) : null
        );
        dictionary.checkedArchers = true;
      }

      var isMultiReference = typeof dictionary[messageCode] == "object";

      if (isMultiReference || !args || (args && !args.type)) {
        if (dictionary[messageCode]) {
          if (hashSettings["force-intl"]) return "INTL";
          result = dictionary[messageCode];
          if (isMultiReference) {
            if (!args || typeof args.entry == "undefined") {
              debugger;
            }
            if (!result[args.entry]) {
              debugger;
            }
            result = result[args.entry];
          } else if (args && !args.doParse) {
            objForEach(args, (val, prop) => {
              result = result.replace(new RegExp(`{{${prop}}}`, "gi"), val);
            });
          } else if (result.indexOf("{{") >= 0) {
            result = result.replace(/{{\w+}}/g, "(.+)");
          }
          return result;
        } else {
          console.log(
            `Translation dictionary for '${serverName}' does not have a translation for message code '${messageCode}'`
          );
          debugger;
        }
      } else if (!args.type) {
        debugger;
      }

      switch (args.type) {
        case "parse":
          var content = args.content;
          if (!content) {
            debugger;
          }
          var format = dictionary[messageCode];
          format = format.replace(/{{\w+}}/g, "(.+)");
          return new RegExp(format, "gi").exec(content);
          break;

        case "regex":
          var result = dictionary[messageCode];
          result = result
            .replace(/\./g, "\\.")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)")
            .replace(/\\/, "\\\\")
            .replace(/{{\w+}}/g, "(.+)");
          return new RegExp(result, "gi");
          break;

        default:
          debugger;
      }
    }
  }

  //  Build custom translations
  {
    var serverName = window.location.hostname.split(".")[0];
    var customTranslations = (() => {
      // Parse translations
      window.console.log("Checking for custom translations...");

      if (typeof translationFormat != "string") {
        window.console.log(
          "No custom translations detected (translationFormat is undefined or not a string)"
        );
        return;
      }

      ////////////////////////////////////////////////////////// TODO

      var lines = translationFormat.trim().split("\n");

      while (
        lines.length > 0 &&
        (lines[0].trim().length == 0 || lines[0].trim()[0] == "#")
      )
        lines.splice(0, 1);

      var world =
        lines.length > 0 ? lines[0].match(/server\s*=\s*(\w+)/) : null;
      if (!world) {
        console.warn(
          '(Custom translation) Missing server name in first line (expected: "server="{name}"; ie "server=en", "server=us", "server=br", etc.) The translation will NOT be loaded.'
        );
        return;
      }

      world = world[1];

      var expectedKeys = [];
      objForEach(INTL, (v) => {
        expectedKeys.push(v);
      });

      var translation = {};
      for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf("#") == 0 || !line.length) {
          continue;
        }
        var match = line.match(/(\w+)\s*=(.+)/);
        if (!match) {
          console.warn(
            "(Custom translation) Unknown value at line " + (i + 1) + ": ",
            line
          );
          continue;
        }

        var key = match[1];
        var value = match[2];

        if (expectedKeys.indexOf(key) < 0) {
          console.error(
            `(Custom translation) Unknown text key '${key}' at line ${i + 1}`
          );
          continue;
        }

        switch (key[0]) {
          //  Regular text
          case "T":
            translation[key] = value.trim();
            break;

          //  Multi-text
          case "M":
            value = value.split(",");
            if (value.length != 12) {
              console.error(
                `(Custom translation) Expected 12 values for text key '${key}' at line ${
                  i + 1
                } but got ${value.length}, sample english text:\n${translate(
                  key,
                  "RAW"
                )}`
              );
              continue;
            }

            for (var j = 0; j < value.length; j++) {
              value[j] = value[j].trim();
            }

            translation[key] = value;
            break;
        }
      }

      var missingKeys = [];
      expectedKeys.forEach((k) =>
        translation[k]
          ? null
          : missingKeys.push(k) &&
            console.warn(
              `(Custom translation) Missing translation for text code '${k}', sample english text:\n${translate(
                k,
                "RAW"
              )}`
            )
      );

      window.console.log(
        "(Custom translation) Built custom translation dictionary: ",
        translation
      );

      if (missingKeys.length) {
        console.warn(
          `(Custom translation) ${missingKeys.length} text keys were missing from the custom dictionary. They will use their English versions instead.`
        );
        missingKeys.forEach((k) => (translation[k] = translations.en[k]));
      } else {
        window.console.log(
          "(Custom translation) Successfully generated custom dictionary."
        );
      }

      var result = {};
      result[world] = translation;
      return result;
    })();

    function exportTranslation(translation) {
      var line = [];
      objForEach(translation, (val, prop) => {
        line.push(`${prop}=${val}`);
      });
      return line.join("\n");
    }
  }

  /*** APP START ***/

  $("#ezs-output").remove();
  var $output = $(
    `<div id="ezs-output" style="display:inline-block">${translate(
      INTL.T_LOADING_SCRIPT
    )}</div>`
  );
  $output.insertAfter(".modemenu:last");

  /************************
   * MAIN SCRIPT START
   */

  {
    /************************
     * LOAD DATA
     */

    //  Remove old changes from previous script runs
    $(".ezs-decoration").remove();
    initLocalStorage();

    /************************
     * STARTUP CHECKS
     *
     * Runs different logic depending on the page and/or its contents
     */

    {
      if (href.indexOf("screen=memo") >= 0) {
        console.log("Loading EZ-Snipe enhancer...");
        $("#ezse-notice").remove();

        $(
          `
                    <div id="ezse-notice">
                        <h3>
                            ${translate(INTL.T_LOADING_ENHANCER)}
                        </h3>
                        <hr style="margin: 25px 0;">
                    </div>
                `.trim()
        ).insertBefore("#content_value h2:first-of-type");
        $.getScript("https://tylercamp.me/tw/ez-snipe-enhancer.js");
        return;
      }

      if (href.indexOf("screen=place") >= 0) {
        console.log("Loading EZ-Snipe autofill...");
        $("#ezse-notice").remove();

        $(
          `
                    <div id="ezsaf-notice">
                        <h4>
                            Loading auto-fill...
                        </h4>
                    </div>
                `.trim()
        ).insertBefore("#content_value > h3");
        return;
      }

      //  Show village IDs and links
      if (window.location.href.indexOf("mode=incoming") < 0) {
        var lastText = null;

        function onClickCustomLink(ev) {
          ev.stopPropagation();
          ev.preventDefault();

          var landingTime = prompt(
            "Enter the landing time to snipe\n(HH:MM:SS:mmm DD/MM/YYYY)\n(ie 01:23:45:678 22/3/2018)",
            lastText || ""
          );
          lastText = landingTime;
          if (!landingTime || !landingTime.length) {
            return false;
          }

          var invalidValueMsg = "Invalid date and time!";

          var parsedInput = extractUserTimeInput(landingTime);

          if (!parsedInput) {
            alert(invalidValueMsg);
            return false;
          }

          var timeParts = parsedInput.time;
          var dateParts = parsedInput.date;

          if (timeParts.length != 4) {
            alert(
              "Time must be of the format: Hours:Minutes:Seconds:Milliseconds"
            );
            return false;
          }

          if (dateParts.length != 3) {
            alert("Date must be of the format: Day/Month/Year");
            return false;
          }

          var hour = parseInt(timeParts[0]);
          var minute = parseInt(timeParts[1]);
          var second = parseInt(timeParts[2]);
          var milliseconds = parseInt(timeParts[3]);

          if (
            isNaN(hour) ||
            isNaN(minute) ||
            isNaN(second) ||
            isNaN(milliseconds)
          ) {
            alert("Invalid time");
            return false;
          }

          var day = parseInt(dateParts[0]);
          var month = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          if (isNaN(day) || isNaN(month) || isNaN(year)) {
            alert("Invalid date");
            return false;
          }

          var landingTime = new Date();
          landingTime.setUTCDate(day);
          landingTime.setUTCMonth(month - 1);
          landingTime.setUTCFullYear(year);
          landingTime.setUTCHours(hour);
          landingTime.setUTCMinutes(minute);
          landingTime.setUTCSeconds(second);
          landingTime.setUTCMilliseconds(milliseconds);

          var $target = $(ev.originalEvent.target);
          var targetId = parseInt($target.text());

          var newIncoming = {
            origin: null,
            destination: {
              id: parseInt(targetId),
              isCustom: true,
            },
            arrival: landingTime,
          };

          getVillageDataById(targetId, (villageData) => {
            var village = newIncoming.destination;
            village.coordText = villageData.coordText;
            village.name = villageData.name;
            village.coord = villageData.coord;

            saveManualIncoming(newIncoming);
            alert(
              `Saved snipe to ${village.name} at ${landingTime.toUTCString()}`
            );
          });

          return false;
        }

        var shownIdsMessage =
          "Village IDs have been displayed for sniping. Use these after running the script on your Incomings page to snipe other players' villages.";

        if (href.indexOf("screen=info_village") >= 0) {
          $output.remove();
          var $villageName = $("#content_value > h2");
          var id = href.match(/id=[^\d]*(\d+)/)[1];
          console.log("Current village ID = ", id);
          var villageName = $villageName.text();
          $villageName.empty();
          $villageName.html(
            `${villageName}<span class="ezs-decoration">, ID: <a>${id}</a></span>`
          );
          $villageName.find("a").click(onClickCustomLink);
          alert(shownIdsMessage);
          return;
        }

        // Modify all village links to show the ID
        var $villageLinks = $("a[href*=info_village]");
        if ($villageLinks.length) {
          $output.remove();
          $villageLinks.each((i, el) => {
            var id = $(el)
              .attr("href")
              .match(/id=[^\d]*(\d+)/)[1];
            var $idLabel = $(
              `<span class="ezs-decoration"><em> (ID: <a>${id}</a>)</em></span>`
            );
            $(el).after($idLabel);
            $idLabel.find("a").click(onClickCustomLink);
          });

          alert(shownIdsMessage);
          return;
        }
      }

      if (
        (href.indexOf("screen=overview_villages") < 0 ||
          href.indexOf("mode=incomings") < 0) &&
        $("#overview_menu > tbody > tr > td.selected").text().trim() !=
          "Incoming"
      ) {
        $output.remove();
        if (confirm(translate(INTL.T_RUN_ON_INCOMINGS))) {
          var url = window.location.origin + window.location.pathname;
          if (villaId) {
            url += "?village=" + villaId + "&";
          } else {
            url += "?";
          }
          url += "screen=overview_villages&mode=incomings";
          if (sitterId) {
            url += "&t=" + sitterId;
          }
          window.location.href = url;
        }
        return;
      }
    }

    /************************
     * LOAD DATA
     */

    //  Load settings

    window.ezsSettings = window.ezsSettings || {};

    if (
      typeof ezsSettings.minimumSnipeDefense != "undefined" &&
      typeof ezsSettings.minimumSnipeDefense == "number"
    ) {
      ezsSettings.minimumSnipeDefense = {
        infantry: ezsSettings.minimumSnipeDefense / 2,
        cavalry: ezsSettings.minimumSnipeDefense / 2,
        archer: 0,
      };
    } else if (
      ezsSettings.minimumSnipeDefense &&
      typeof ezsSettings.minimumSnipeDefense == "object"
    ) {
      ezsSettings.minimumSnipeDefense.infantry =
        ezsSettings.minimumSnipeDefense.infantry || 0;
      ezsSettings.minimumSnipeDefense.cavalry =
        ezsSettings.minimumSnipeDefense.cavalry || 0;
      ezsSettings.minimumSnipeDefense.archer =
        ezsSettings.minimumSnipeDefense.archer || 0;
    } else {
      ezsSettings.minimumSnipeDefense = {
        infantry: 2500,
        cavalry: 2500,
        archer: 0,
      };
    }
    ezsSettings.offensiveSnipes = !!ezsSettings.offensiveSnipes || false;
    ezsSettings.disabledTroopIndices = ezsSettings.disabledTroopIndices || [];
    ezsSettings.maximumTimeUntilLaunch =
      ezsSettings.maximumTimeUntilLaunch || 24;

    var randomString = () => Math.random().toString().substr(2);
    tcRequire(
      [
        {
          url:
            "https://tylercamp.me/tw/twstats.js?cacheBuster=" + randomString(),
          indicator: () => window.TW,
        }, // Troop stats - names, off/def, speed, etc.
        {
          url: `https://${window.location.host}/interface.php?func=get_config`,
          nonJs: true,
          indicator: () => window.TW && TW.loadedSpeeds,
          onLoad: (data) => {
            var $xml = $(data);
            var archersEnabled = !!parseInt($xml.find("game archer").text());
            var paladinEnabled = !!parseInt($xml.find("game knight").text());
            var gameSpeed = parseFloat($xml.find("speed").text());
            var unitSpeed = parseFloat($xml.find("unit_speed").text());

            console.log({
              archersEnabled,
              paladinEnabled,
              gameSpeed,
              unitSpeed,
            });

            TW.gameSpeed = gameSpeed;
            TW.unitSpeed = unitSpeed;
            TW.loadedSpeeds = true;

            if (!archersEnabled) {
              console.log(
                "World has archers disabled, removing archers from parser"
              );
              let archerUnit = TW.unitTypes.filter((t) => t.name == "Archer");
              let marcherUnit = TW.unitTypes.filter(
                (t) => t.name == "Mounted Ar."
              );
              TW.unitTypes.splice(TW.unitTypes.indexOf(archerUnit), 1);
              TW.unitTypes.splice(TW.unitTypes.indexOf(marcherUnit), 1);
            }

            if (!paladinEnabled) {
              console.log(
                "World has paladins disabled, removing paladins from parser"
              );
              let paladinUnit = TW.unitTypes.filter((t) => t.name == "Paladin");
              TW.unitTypes.splice(TW.unitTypes.indexOf(paladinUnit), 1);
            }

            console.log(
              "Finished loading world config, final troop types: ",
              TW.unitTypes
            );
          },
        },
      ],
      () => {
        /************************
         * STARTUP
         */

        // Get player villages
        var villasUrl = makeSitterUrl(
          `/game.php?village=${villaId}&screen=overview_villages&mode=units&page=-1`
        );
        console.log("villasUrl = ", villasUrl);
        console.log("Querying for available villas and unit counts");
        $.get(villasUrl, (data) => {
          console.log("Received troop data");
          var villagesData = [];

          var $doc = $(data);
          var $villageRows = $doc.find("#units_table tbody.row_marker");

          var villas = parseOverviewVillaRows($villageRows);

          var $selectedRows = $("#incomings_table tr.nowrap").filter((i, e) =>
            $(e).find("input[type=checkbox]").prop("checked")
          );
          runSnipes($selectedRows, villas);
        });
      }
    );

    function updateIncomings($incomingRows, villas, incomings, serverDate) {
      var targetedVillages = {};

      incomings.splice(0, incomings.length);
      $incomingRows.each((i, el) => {
        var $el = $(el);
        var $destination = $el.find("td:nth-child(2)");
        var $origin = $el.find("td:nth-child(3)");
        var $arrival = $el.find("td:nth-child(6)");

        //console.log($el, $destination, $origin, $arrival);

        var destinationText = /(\d+\|\d+)/.exec($destination.text().trim())[1];
        var originText = /(\d+\|\d+)/.exec($origin.text().trim())[1];
        var arrivalText = $arrival.text().trim();

        //console.log(destinationText, originText, arrivalText);

        var destination, origin, arrival;

        origin = {
          x: parseInt(originText.split("|")[0]),
          y: parseInt(originText.split("|")[1]),
        };

        destination = {
          x: parseInt(destinationText.split("|")[0]),
          y: parseInt(destinationText.split("|")[1]),
        };

        destination = findVillaByCoord(villas, destination);

        arrival = new Date();
        arrival.setUTCDate(serverDate.getUTCDate());
        arrival.setUTCMonth(serverDate.getUTCMonth());
        arrival.setUTCFullYear(serverDate.getUTCFullYear());

        if (
          translate(INTL.T_TOMORROW_AT, { type: "regex" }).exec(arrivalText) ||
          translate(INTL.T_TODAY_AT, { type: "regex" }).exec(arrivalText)
        ) {
          // Format: "tomorrow at HH:MM:SS:mmm";
          var match;
          if (
            !(match = translate(INTL.T_TOMORROW_AT, { type: "regex" }).exec(
              arrivalText
            )) &&
            !(match = translate(INTL.T_TODAY_AT, { type: "regex" }).exec(
              arrivalText
            ))
          ) {
            debugger;
            return;
          }

          if (
            translate(INTL.T_TOMORROW_AT, { type: "regex" }).exec(arrivalText)
          ) {
            arrival.setUTCDate(arrival.getUTCDate() + 1);
          }

          match = match[1].split(":");

          var hr = parseInt(match[0]);
          var min = parseInt(match[1]);
          var sec = parseInt(match[2]);
          var ms = parseInt(match[3]);
          arrival.setUTCHours(hr);
          arrival.setUTCMinutes(min);
          arrival.setUTCSeconds(sec);
          arrival.setUTCMilliseconds(ms);
        } else if (
          translate(INTL.T_ON_AT, { type: "regex" }).exec(arrivalText)
        ) {
          // Format: "on DD.MM. at HH:MM:SS:mmm"
          var match = translate(INTL.T_ON_AT, { type: "regex" }).exec(
            arrivalText
          );
          if (!match) {
            debugger;
            return;
          }
          var date = match[1];
          date = date.split(".");
          var time = match[2];
          time = time.split(":");
          var day = parseInt(date[0]);
          var month = parseInt(date[1]);
          var hr = parseInt(time[0]);
          var min = parseInt(time[1]);
          var sec = parseInt(time[2]);
          var ms = parseInt(time[3]);
          arrival.setUTCMonth(month - 1);
          arrival.setUTCDate(day);
          arrival.setUTCHours(hr);
          arrival.setUTCMinutes(min);
          arrival.setUTCSeconds(sec);
          arrival.setUTCMilliseconds(ms);
        } else {
          console.error(
            `Couldn't understand arrivalText value '${arrivalText}', likely an incorrect or missing translation for the current server, the script may break`
          );
          debugger;
          return;
        }

        //console.log(origin, destination, arrival);

        targetedVillages[destination.id] = destination;

        incomings.push({
          origin: origin,
          destination: destination,
          arrival: arrival,
        });
      });

      return targetedVillages;
    }

    function onSigilsDoneCreateSnipesAndInterface(incomings, villas) {
      console.log("Sigils loaded");
      var currentTime = new Date();
      var serverTime = /(\d+):(\d+):(\d+)/.exec($("#serverTime").text());
      var serverDate = /(\d+)\/(\d+)\/(\d+)/.exec($("#serverDate").text());

      currentTime.setUTCDate(parseInt(serverDate[1]));
      currentTime.setUTCMonth(parseInt(serverDate[2]) - 1); // - 1 since days need to start from 0
      currentTime.setUTCFullYear(parseInt(serverDate[3]));

      currentTime.setUTCHours(parseInt(serverTime[1]));
      currentTime.setUTCMinutes(parseInt(serverTime[2]));
      currentTime.setUTCSeconds(parseInt(serverTime[3]));

      console.log("Current time: " + currentTime.toUTCString());

      incomings.push(...getManualIncomings());

      console.log("Calculating snipe options...");
      function makeSnipeOptions() {
        var snipeOptions;
        (() => {
          var st = new Date().valueOf();
          snipeOptions = makeSnipePermutations(currentTime, villas, incomings);
          var end = new Date().valueOf();
          console.log("Finished in " + (end - st) + "ms");
        })();
        console.log("All snipe options:", snipeOptions);

        snipeOptions = (function filterOptions(options) {
          var filteredOptions = [];
          options.forEach((o) => {
            //  Skip a villa if it doesn't have enough defensive troops to meet minimum snipe population
            var defensiveStats = calculateTroopStatsByUnitSpeed(
              o.sourceVillageData.ownTroopsInVilla,
              o.unitType,
              ezsSettings.offensiveSnipes ? null : "Defensive"
            );
            o.stats = defensiveStats;
            if (
              defensiveStats.totalInfDef -
                ezsSettings.minimumSnipeDefense.infantry <
                0 ||
              defensiveStats.totalCavDef -
                ezsSettings.minimumSnipeDefense.cavalry <
                0 ||
              defensiveStats.totalArDef -
                ezsSettings.minimumSnipeDefense.archer <
                0
            ) {
              return;
            }

            //  Check if there is already a snipe with the same launch time, target villa, and source villa
            var exists = false;
            filteredOptions.forEach((fo) => {
              if (
                fo.sourceVillageData == o.sourceVillageData &&
                fo.launchTime.valueOf() == o.launchTime.valueOf() &&
                fo.targetVillageData == o.targetVillageData
              ) {
                exists = true;
              }
            });

            if (exists) {
              return;
            }

            o.stats = defensiveStats;
            filteredOptions.push(o);
          });
          return filteredOptions;
        })(snipeOptions);

        console.log("Filtered options: ", snipeOptions);

        var snipes = [];
        snipeOptions.forEach((so) => {
          snipes.push({
            schedule: so,
            units: makeBasicSnipeBuild(so),
          });
        });
        return snipes;
      }

      var numInputStyle = `"width:4em;"`;

      $output.html(
        `
                <h2 style="margin:0">${translate(INTL.T_SNIPE)}</h2>
                <h4 style="margin:0">Bugs? PM <a href="https://www.reddit.com/message/compose/?to=tylercamp">/u/tylercamp</a></h4>
                <h4 style="margin:0">Or post on the <a href="https://forum.tribalwars.net/index.php?threads/ez-snipe.280975/">Official Forum Thread</a></h4>
                <hr>
                <div style="float:left; line-height:1.5em">
                    <h4>${translate(INTL.T_OPTIONS)}</h4>
                    <div style="padding-left: 1em;">
                        <label for="ezs-select-display">${translate(
                          INTL.T_DISPLAY
                        )} </label>
                        <select id="ezs-select-display">
                            <option value="source">${translate(
                              INTL.T_BY_SRC_VILLA
                            )}</option>
                            <option value="destination">${translate(
                              INTL.T_BY_DST_VILLA
                            )}</option>
                            <option value="all" selected>${translate(
                              INTL.T_ALL
                            )}</option>
                        </select>
                        <br>
                        <input type="checkbox" id="ezs-use-compact" checked>
                        <label for="ezs-use-compact">${translate(
                          INTL.T_COMPACT_MODE
                        )}</label>
                        <br>
                        <input type="checkbox" id="ezs-use-icons" checked>
                        <label for="ezs-use-icons">${translate(
                          INTL.T_USE_TROOP_ICONS
                        )}</label>
                    </div>

                    <h4>${translate(INTL.T_OPTIONS_SNIPE)}</h4>
                    <div style="padding-left: 1em;">
                        <input type="checkbox" id="ezs-offensive-snipes" ${
                          ezsSettings.offensiveSnipes ? "checked" : ""
                        }>
                        <label for="ezs-offensive-snipes">${translate(
                          INTL.T_USE_OFFENSIVE_SNIPES
                        )}</label>
                        <br>
                        <br>
                        <input type="number" id="ezs-max-launch-time" value="${
                          ezsSettings.maximumTimeUntilLaunch
                        }" style=${numInputStyle}>
                        <label for="ezs-max-launch-time">${translate(
                          INTL.T_MAX_LAUNCH_TIME
                        )}</label>
                        <br>
                        <br>
                        ${translate(
                          INTL.T_MINIMUM_SNIPE_DEF
                        )} (<a target="_blank" href="http://tylercamp.me/tw/#eyJ3b3JsZFNwZWVkIjoiMSIsInN0cnVjdHVyZXMiOnsiQmFycmFja3MiOjcsIlN0YWJsZSI6MywiV29ya3Nob3AiOjEsIkFjYWRlbXkiOjF9LCJ0ZXh0IjoiNTAgc3BlYXJzXG41MCBzd29yZHNcbjI1IGFyY2hlcnMifQ==">reference</a>)
                        <br>
                        - <input type="number" id="ezs-min-inf-def" style=${numInputStyle} value="${
          ezsSettings.minimumSnipeDefense.infantry
        }"> ${translate(INTL.T_ANTI_INFANTRY)}
                        <br>
                        - <input type="number" id="ezs-min-cav-def" style=${numInputStyle} value="${
          ezsSettings.minimumSnipeDefense.cavalry
        }"> ${translate(INTL.T_ANTI_CAVALRY)}
                        <br>
                        - <input type="number" id="ezs-min-archer-def" style=${numInputStyle} value="${
          ezsSettings.minimumSnipeDefense.archer
        }"> ${translate(INTL.T_ANTI_ARCHER)}
                    </div>
                    <br>
                    <input type="submit" value="Recalculate" id="ezs-recalculate-snipes-btn">
                </div>
                <div style="float:right; text-align: right;">
                    <h4>Add Manually</h4>
                    <div style="margin-bottom:1em">
                        <label>To </label>
                        <input style="width:4em;" id="ezs-manual-target" type="text" placeholder="12345">
                        <label>At </label>
                        <input style="width:4.5em;" id="ezs-manual-time" type="text" placeholder="12:00:00">
                        <input style="width:5.5em;" id="ezs-manual-date" type="text" value="${$(
                          "#serverDate"
                        ).text()}">
                        <label>Sigil </label>
                        <input style="width:2em" id="ezs-manual-sigil" type="text" value="0">%
                        <br>
                        <input id="ezs-manual-submit" type="button" value="Add">
                    </div>
                    <em>
                        <div id="ezs-custom-entries">
                        </div>
                    </em>
                </div>

                <div style="clear:both;margin-bottom:1em;"></div>

                <div id="ezs-bb-code"></div>
                <p id="ezs-stats">
                    <em>${translate(INTL.T_NUM_SNIPES_MADE, {
                      count: makeSnipeOptions().length,
                    })}</em>
                </p>
                <h4 style="margin-bottom: 1.5em;">
                    ${translate(INTL.T_REFRESH_1)}
                    <br>
                    ${translate(INTL.T_REFRESH_2)}
                </h4>
            `.trim()
      );

      $output
        .find("#ezs-manual-sigil")
        .val(parseInt(localStorage.getItem("ezs-last-sigil") || "0"));

      var $bbCodeContainer = $output.find("#ezs-bb-code");
      updateOutput();

      function updateOutput() {
        var snipes = makeSnipeOptions();
        console.log("Generated snipes: ", snipes);

        $output
          .find("#ezs-stats em")
          .text(translate(INTL.T_NUM_SNIPES_MADE, { count: snipes.length }));

        var displayType = $("#ezs-select-display").val();
        $bbCodeContainer.empty();
        makeBbCodeOutput($bbCodeContainer, displayType, currentTime, snipes);
      }

      $output
        .find(
          `
                #ezs-use-compact,
                #ezs-use-icons,
                #ezs-select-display,
                input[name^=id_]
                `.trim()
        )
        .change(updateOutput);

      $output.find("#ezs-recalculate-snipes-btn").click(() => {
        ezsSettings.offensiveSnipes = $("#ezs-offensive-snipes").prop(
          "checked"
        );
        ezsSettings.maximumTimeUntilLaunch = $("#ezs-max-launch-time").val();
        ezsSettings.minimumSnipeDefense = {
          infantry: parseInt($("#ezs-min-inf-def").val()),
          cavalry: parseInt($("#ezs-min-cav-def").val()),
          archer: parseInt($("#ezs-min-archer-def").val()),
        };

        updateOutput();
      });

      getManualIncomings().forEach(makeManualIncomingEntry);

      function makeManualIncomingEntry(newIncoming) {
        var makeTwTimeString = (datetime) => {
          var time2 = (n) =>
            "0".repeat(Math.max(0, 2 - n.toString().length)) + n;
          var time3 = (n) =>
            "0".repeat(Math.max(0, 3 - n.toString().length)) + n;
          var timePart = `${time2(datetime.getUTCHours())}:${time2(
            datetime.getUTCMinutes()
          )}:${time2(datetime.getUTCSeconds())}:${time3(
            datetime.getUTCMilliseconds()
          )}`;
          var datePart = `${time2(datetime.getUTCDate())}/${time2(
            datetime.getUTCMonth() + 1
          )}/${datetime.getUTCFullYear()}`;
          return `${timePart} (${datePart})`;
        };

        var $newEntry = $(
          `
                    <div>
                        To ${
                          newIncoming.destination.name
                        } at ${makeTwTimeString(newIncoming.arrival)} (${
            newIncoming.destination.speedModifier * 100 || 0
          }% sigil)
                        <img style="cursor:pointer;vertical-align:middle" src="https://dsen.innogamescdn.com/8.114/36050/graphic/delete.png">
                    </div>
                `.trim()
        );
        $newEntry.find("img").click(() => {
          $newEntry.remove();
          incomings.splice(incomings.indexOf(newIncoming), 1);
          deleteManualIncoming(newIncoming);
          updateOutput();
        });
        $("#ezs-custom-entries").append($newEntry);
        updateOutput();
      }

      $output.find("#ezs-manual-submit").click(() => {
        var target = $output.find("#ezs-manual-target").val();
        var launchTimeParts = $output.find("#ezs-manual-time").val();
        var launchDateParts = $output.find("#ezs-manual-date").val();
        var sigilPercent = parseInt(
          $output.find("#ezs-manual-sigil").val() || "0"
        );

        localStorage.setItem("ezs-last-sigil", sigilPercent.toString());

        if (target) {
          target = parseInt(target);
        }

        if (launchTimeParts) {
          launchTimeParts = launchTimeParts.split(":");
          if (launchTimeParts.length < 3 || launchTimeParts.length > 4) {
            launchTimeParts = null;
          } else {
            launchTimeParts.forEach((t) => {
              t = parseInt(t);
              if (!t && t != 0) {
                launchTimeParts = null;
              }
            });
          }
        }

        if (launchDateParts) {
          launchDateParts = launchDateParts.split("/");
          if (launchDateParts.length != 3) {
            launchDateParts = null;
          } else {
            launchDateParts.forEach((d) => {
              d = parseInt(d);
              if (!d && d != 0) {
                launchDateParts = null;
              }
            });
          }
        }

        if (!target) {
          alert(
            'Enter a valid Target Village ID. Open a page to view the target village and look at the "id=" part of the URL, or run this script while viewing a page with a village link.'
          );
          return;
        }
        if (!launchTimeParts) {
          alert("Enter a valid launch time.");
          return;
        }
        if (!launchDateParts) {
          alert("Enter a valid launch date.");
          return;
        }

        var landingTime = new Date();
        landingTime.setUTCDate(launchDateParts[0]);
        landingTime.setUTCMonth(launchDateParts[1] - 1);
        landingTime.setUTCFullYear(launchDateParts[2]);
        landingTime.setUTCHours(launchTimeParts[0]);
        landingTime.setUTCMinutes(launchTimeParts[1]);
        landingTime.setUTCSeconds(launchTimeParts[2]);
        landingTime.setUTCMilliseconds(launchTimeParts[3] || 0);

        var newIncoming = {
          origin: null,
          destination: {
            id: target,
            isCustom: true,
            speedModifier: sigilPercent / 100,
          },
          arrival: landingTime,
        };

        var villa = newIncoming.destination;

        getVillageDataById(target, (villageData) => {
          villa.coordText = villageData.coordText;
          villa.name = villageData.name;
          villa.coord = villageData.coord;

          console.log("Saving manual incoming", newIncoming);

          saveManualIncoming(newIncoming);
          incomings.push(newIncoming);

          makeManualIncomingEntry(newIncoming);
        });
      });
    }

    function runSnipes($incomingRows, villas) {
      console.log("Got own villas: ", villas);
      $output.empty();

      $output.append(
        `<p>${translate(
          INTL.T_MAKE_SNIPES_CHECK_SIGILS
        )} <span id="ezs-sigil-progress"></span></p>`
      );

      var serverDate = new Date();
      var dateMatch = $("#serverDate").text().split("/");
      serverDate.setUTCDate(dateMatch[0]);
      serverDate.setUTCMonth(dateMatch[1] - 1);
      serverDate.setUTCFullYear(dateMatch[2]);

      var incomings = [];
      var targetedVillages = {};

      targetedVillages = updateIncomings(
        $incomingRows,
        villas,
        incomings,
        serverDate
      );
      console.log("Incomings: ", incomings);

      console.log("Checking for sigils...");
      var pendingUrls = [];
      for (var prop in targetedVillages) {
        if (!targetedVillages.hasOwnProperty(prop)) {
          continue;
        }
        var villa = targetedVillages[prop];
        var villaOverviewUrl = makeSitterUrl(
          `https://${window.location.host}/game.php?village=${villa.id}&screen=overview`
        );
        pendingUrls.push({
          villa: villa,
          url: villaOverviewUrl,
        });
      }

      if (!pendingUrls.length) {
        onSigilsDoneCreateSnipesAndInterface(incomings, villas);
      } else {
        var numChecked = 0;
        pendingUrls.forEach((p, i) => {
          var villa = p.villa;
          var url = p.url;

          var requestInterval = 500;

          setTimeout(() => {
            $.get(url, (data) => {
              ++numChecked;
              if (!data) {
                if (numChecked == pendingUrls.length) {
                  onSigilsDoneCreateSnipesAndInterface(incomings, villas);
                }
                return;
              }
              var $doc = $(data);
              var $buffs = $doc.find(".village_overview_effect");
              console.log("Effects: ", $buffs);
              $buffs.each((i, el) => {
                var $el = $(el);
                //  Tribal wars stores the sigil buff in the "title" of the <td>, no clue why
                if (
                  !$el.attr("title") ||
                  $el.attr("title").indexOf("sent") < 0
                ) {
                  return;
                }
                console.log("Found sigil: ", $el);
                var match = translate(INTL.T_INCOMING_SUPPORT_BUFF, {
                  type: "parse",
                  content: $el.attr("title"),
                });
                if (!match) {
                  debugger;
                  return;
                }
                var modifier = parseFloat(match[1]);
                villa.speedModifier = modifier / 100;

                console.log(
                  "Updated speed modifier to " + modifier + "% for ",
                  villa
                );
              });

              if (numChecked == pendingUrls.length) {
                onSigilsDoneCreateSnipesAndInterface(incomings, villas);
              }
            });
          }, i * requestInterval);
        });
      }
    }
  }
})();

//# sourceURL=https://tylercamp.me/tw/ez-snipe.js
