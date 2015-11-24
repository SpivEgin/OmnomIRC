/**
 * @license
 * OmnomIRC COPYRIGHT 2010,2011 Netham45
 *                    2012-2015 Sorunome
 *
 *  This file is part of OmnomIRC.
 *
 *  OmnomIRC is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  OmnomIRC is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with OmnomIRC.  If not, see <http://www.gnu.org/licenses/>.
 */

oirc = (function(){
	var OMNOMIRCSERVER = 'https://omnomirc.omnimaga.org',
		settings = (function(){
			var self = {
				hostname:'',
				nick:'',
				signature:'',
				numHigh:4,
				uid:-1,
				checkLoginUrl:'',
				net:'',
				networks:{},
				fetch:function(fn,clOnly){
					if(clOnly===undefined){
						clOnly = false;
					}
					network.getJSON('config.php?js'+(document.URL.split('network=')[1]!==undefined?'&network='+document.URL.split('network=')[1].split('&')[0].split('#')[0]:'')+(clOnly?'&clonly':''),function(data){
						var set;
						if(!clOnly){
							self.hostname = data.hostname;
							channels.setChans(data.channels);
							parser.setSmileys(data.smileys);
							self.networks = {};
							$.each(data.networks,function(i,n){
								self.networks[n.id] = n;
							});
							self.net = data.network;
							ls.setPrefix(self.net);
							options.setDefaults(data.defaults);
							options.setExtraChanMsg(data.extraChanMsg);
							request.setData(data.websockets.use,data.websockets.host,data.websockets.port,data.websockets.ssl);
						}
						
						self.checkLoginUrl = data.checkLoginUrl;
						
						set = ls.get('checklogin');
						if(!set){
							network.getJSON(self.checkLoginUrl+'&network='+self.net.toString()+'&jsoncallback=?',function(data){
								self.nick = data.nick;
								self.signature = data.signature;
								self.uid = data.uid;
								ls.set('checklogin',{
									nick:self.nick,
									signature:self.signature,
									uid:self.uid
								});
								if(fn!==undefined){
									fn();
								}
							},!clOnly,false);
						}else{
							self.nick = set.nick;
							self.signature = set.signature;
							self.uid = set.uid;
							if(fn!==undefined){
								fn();
							}
						}
					},!clOnly,false);
				},
				getUrlParams:function(){
					return 'nick='+base64.encode(self.nick)+'&signature='+base64.encode(self.signature)+'&time='+(+new Date()).toString()+'&id='+self.uid+'&network='+self.net+(self.nick!=''?'&noLoginErrors':'');
				},
				getNetwork:function(i){
					if(self.networks[i]!==undefined){
						return self.networks[i];
					}
					return {
						id:-1,
						normal:'NICK',
						userlist:'NICK',
						name:'Invalid network',
						type:-1
					};
				},
				getIdentParams:function(){
					return {
						nick:self.nick,
						signature:self.signature,
						time:(+new Date()).toString(),
						id:self.uid,
						network:self.net
					};
				}
			};
			return {
				fetch:self.fetch,
				getUrlParams:self.getUrlParams,
				getIdentParams:self.getIdentParams,
				getNetwork:self.getNetwork,
				nick:function(){
					return self.nick;
				},
				net:function(){
					return self.net;
				},
				loggedIn:function(){
					return self.signature !== '';
				}
			};
		})(),
		ls = (function(){
			var self = {
				prefix:'',
				setPrefix:function(p){
					self.prefix = p;
				},
				getCookie:function(c_name){
					var i,x,y,ARRcookies=document.cookie.split(";");
					for(i=0;i<ARRcookies.length;i++){
						x=ARRcookies[i].substr(0,ARRcookies[i].indexOf("="));
						y=ARRcookies[i].substr(ARRcookies[i].indexOf("=")+1);
						x=x.replace(/^\s+|\s+$/g,"");
						if(x==c_name){
							return unescape(y);
						}
					}
				},
				setCookie:function(c_name,value,exdays){
					var exdate = new Date(),
						c_value = escape(value);
					exdate.setDate(exdate.getDate() + exdays);
					c_value += ((exdays===null) ? '' : '; expires='+exdate.toUTCString());
					document.cookie=c_name + '=' + c_value;
				},
				haveSupport:null,
				support:function(){
					if(self.haveSupport===null){
						try{
							localStorage.setItem('test',1);
							localStorage.removeItem('test');
							self.haveSupport = true;
						}catch(e){
							self.haveSupport = false;
						}
					}
					return self.haveSupport;
				},
				get:function(name){
					var s;
					name = self.prefix+name;
					if(self.support()){
						s = localStorage.getItem(name);
					}else{
						s = getCookie(name);
					}
					return JSON.parse(s);
				},
				set:function(name,value){
					name = self.prefix+name;
					value = JSON.stringify(value);
					if(self.support()){
						localStorage.setItem(name,value);
					}else{
						setCookie(name,value);
					}
				}
			}
			return {
				setPrefix:self.setPrefix,
				get:self.get,
				set:self.set
			};
		})(),
		network = (function(){
			var self = {
				errors:[],
				warnings:[],
				errorsOpen:false,
				warningsOpen:false,
				didRelog:false,
				removeSig:function(s){
					try{
						var parts = s.split('signature='),
							moreParts = parts[1].split('&');
						moreParts[0] = '---';
						parts[1] = moreParts.join('&');
						return parts.join('signature=');
					}catch(e){
						if(s.indexOf('signature')!==-1){
							return 'omited due to security reasons';
						}
						return s;
					}
				},
				addError:function(s,e){
					s = self.removeSig(s);
					self.errors.push({
						time:(new Date().getTime()),
						file:s,
						content:e
					});
					$('#errors').css('display','').find('.count').text(self.errors.length);
				},
				addWarning:function(s,e){
					s = self.removeSig(s);
					self.warnings.push({
						time:(new Date().getTime()),
						file:s,
						content:e
					});
					$('#warnings').css('display','').find('.count').text(self.warnings.length)
				},
				checkCallback:function(data,fn,recall,url){
					if(data.relog!=2){
						if(data.errors!==undefined){
							$.map(data.errors,function(e){
								if(e.type!==undefined){
									addError(url,e);
								}else{
									addError(url,{
										type:'misc',
										message:e
									});
								}
								if(errorsOpen){
									$('.errors > .errorPopupCont').append(self.getSinglePopupEntry(errors[errors.length - 1]));
								}
							});
						}
						if(data.warnings!==undefined){
							$.map(data.warnings,function(w){
								if(w.type!==undefined){
									addWarning(url,w);
								}else{
									addWarning(url,{
										type:'misc',
										message:w
									});
								}
								if(warningsOpen){
									$('.warnings > .errorPopupCont').append(self.getSinglePopupEntry(warnings[warnings.length - 1]));
								}
							});
						}
					}
					if(data.relog!==undefined && data.relog!=0){
						if(data.relog==1){
							settings.fetch(undefined,true); // everything is still fine, no need to block the rest of the thread
							fn(data);
						}else if(data.relog==2){
							settings.fetch(function(){
								recall();
							},true);
						}else if(data.relog==3){
							if(self.didRelog){ // that's it, no more trying!
								fn(data);
							}else{
								settings.fetch(function(){
									recall();
								},true);
							}
						}
						self.didRelog = true;
					}else{
						self.didRelog = false; // relog successfull, new try!
						fn(data);
					}
				},
				getSinglePopupEntry:function(e){
					return $('<div>')
						.css('border-bottom','1px solid black')
						.append(
							'Time: ',
							(new Date(e.time)).toLocaleTimeString(),
							'<br>File: ',
							$('<span>').text(e.file).html(),
							$.map(e.content,function(val,i){
								return ['<br>',$('<span>').text(i).html(),': ',$('<span>').text(val).html()];
							})
						);
				},
				makePopup:function(type,data,fn){
					return $('<div>')
						.addClass('errorPopup')
						.addClass(type.toLowerCase())
						.append(
							$('<a>')
								.text('Close')
								.click(function(e){
									e.preventDefault();
									$(this).parent().remove();
									fn();
								}),
							'&nbsp;',
							$('<b>')
								.text(type),
							$('<div>')
								.addClass('errorPopupCont')
								.append(
									$.map(data,function(e){
										return self.getSinglePopupEntry(e);
									})
								)
						)
						.appendTo('body');
				},
				getJSON:function(s,fn,async,urlparams){
					if(async==undefined){
						async = true;
					}
					if(urlparams==undefined){
						urlparams = true;
					}
					var url = s+(urlparams?'&'+settings.getUrlParams():'');
					return $.ajax({
							url:url,
							dataType:'json',
							async:async
						})
						.done(function(data){
							self.checkCallback(data,fn,function(){
								self.getJSON(s,fn,async,urlparams);
							},url);
						});
				},
				post:function(s,pdata,fn,async,urlparams){
					if(async==undefined){
						async = true;
					}
					if(urlparams==undefined){
						urlparams = true;
					}
					var url = s+(urlparams?'&'+settings.getUrlParams():'');
					return $.ajax({
							type:'POST',
							url:url,
							async:async,
							data:pdata
						})
						.done(function(data){
							self.checkCallback(data,fn,function(){
								self.post(s,pdata,fn,async,urlparams);
							},url);
						});
				},
				init:function(){
					$('#errors > .icon')
						.click(function(){
							if(!errorsOpen){
								errorsOpen = true;
								makePopup('Errors',errors,function(){
									errorsOpen = false;
								});
							}
						});
					$('#warnings > .icon')
						.click(function(){
							if(!warningsOpen){
								warningsOpen = true;
								makePopup('Warnings',warnings,function(){
									warningsOpen = false;
								});
							}
						});
				}
			};
			return {
				getJSON:self.getJSON,
				post:self.post,
				init:self.init
			};
		})(),
		options = (function(){
			var self = {
				extraChanMsg:'',
				allOptions:{
					highBold:{
						disp:'Highlight Bold',
						default:true
					},
					highRed:{
						disp:'Highlight Red',
						default:true
					},
					colordNames:{
						disp:'Colored Names',
						default:0,
						handler:function(){
							return $('<td>')
								.attr('colspan',2)
								.css('border-right','none')
								.append($('<select>')
									.change(function(){
										self.set('colordNames',this.value);
									})
									.append(
										$.map(['none','calc','server'],function(v,i){
											return $('<option>')
												.attr((self.get('colordNames')==i?'selected':'false'),'selected')
												.val(i)
												.text(v);
										})
									)
								)
						}
					},
					curChan:{
						hidden:true,
						default:0
					},
					extraChans:{
						disp:'Show extra Channels',
						default:false,
						before:function(){
							if(self.extraChanMsg!==''){
								alert(self.extraChanMsg);
							}
							return true;
						}
					},
					altLines:{
						disp:'Alternating Line Highlight',
						default:true
					},
					enable:{
						disp:'Enable OmnomIRC',
						default:true
					},
					ding:{
						disp:'Ding on Highlight',
						default:false
					},
					times:{
						disp:'Show Timestamps',
						default:true
					},
					statusBar:{
						disp:'Show Updates in Browser Status Bar',
						default:true
					},
					smileys:{
						disp:'Show Smileys',
						default:true
					},
					hideUserlist:{
						disp:'Hide Userlist',
						default:false
					},
					charsHigh:{
						disp:'Number chars for Highlighting',
						default:4,
						handler:function(){
							return $('<td>')
								.attr('colspan',2)
								.css('border-right','none')
								.append($('<select>')
									.change(function(){
										self.set('charsHigh',this.value);
									})
									.append(
										$.map([1,2,3,4,5,6,7,8,9,10],function(i){
											return $('<option>')
												.attr((self.get('charsHigh')==i?'selected':'false'),'selected')
												.val(i)
												.text(i);
										})
									)
								);
						}
					},
					scrollBar:{
						disp:'Show Scrollbar',
						default:true
					},
					scrollWheel:{
						disp:'Enable Scrollwheel',
						default:true
					},
					browserNotifications:{
						disp:'Browser Notifications',
						default:false,
						before:function(){
							notification.request();
							return false;
						}
					},
					oircJoinPart:{
						disp:'Show OmnomIRC join/part messages',
						default:false
					},
					wysiwyg:{
						disp:'Use WYSIWYG editor (experimental)',
						default:false
					},
					textDeco:{
						disp:'Enable simple text decorations',
						default:false
					},
					fontSize:{
						disp:'Font Size',
						default:9,
						handler:function(){
							return $('<td>')
								.attr('colspan',2)
								.css('border-right','none')
								.append($('<input>')
									.attr({
										type:'number',
										step:1,
										min:1,
										max:42
									})
									.css('width','3em')
									.val(self.get('fontSize'))
									.change(function(){
										self.set('fontSize',parseInt(this.value,10));
										$('body').css('font-size',this.value+'pt');
									})
								)
						}
					}
				},
				init:function(def){
					var opts = ls.get('options');
					$.each(self.allOptions,function(i,v){
						var val = v.default;
						if(opts && opts[i]!==undefined){
							val = opts[i];
						}else if(def && def[i]!==undefined){
							val = def[i];
						}
						self.allOptions[i].value = val;
					});
				},
				set:function(s,v){
					if(self.allOptions[s]===undefined){
						return;
					}
					self.allOptions[s].value = v;
					var opts = ls.get('options') || {};
					opts[s] = v;
					ls.set('options',opts);
				},
				get:function(s){
					if(self.allOptions[s]!==undefined){
						return self.allOptions[s].value;
					}
				},
				setExtraChanMsg:function(s){
					self.extraChanMsg = s;
				},
				setDefaults:function(def){
					self.init(def);
				},
				getHTML:function(){
					return $.merge($.map([false,true],function(alternator){
							return $('<table>')
								.addClass('optionsTable')
								.append(
									$.map(self.allOptions,function(o,i){
										if(o.hidden){
											return;
										}
										return ((alternator = !alternator)?$('<tr>')
											.append(
												$.merge(
												[$('<td>')
													.text(o.disp)],
												(o.handler===undefined?[
												$('<td>')
													.addClass('option '+(self.get(i)?'selected':''))
													.text('Yes')
													.click(function(){
														if(!self.get(i)){
															if((o.before!==undefined && o.before()) || o.before===undefined){
																self.set(i,true);
																$(this).addClass('selected').next().removeClass('selected');
															}
														}
													}),
												$('<td>')
													.addClass('option '+(!self.get(i)?'selected':''))
													.text('No')
													.click(function(){
														if(self.get(i)){
															self.set(i,false);
															$(this).addClass('selected').prev().removeClass('selected');
														}
													})]:o.handler()))
											):'');
									})
								);
					}),
					$('<div>').append(
						'&nbsp;',
						$('<a>')
							.text('Reset Defaults')
							.click(function(e){
								e.preventDefault();
								ls.set('options',null);
								ls.set('checklogin',null);
								ls.set('channels',null);
								document.location.reload();
							})
					));
				}
			};
			return {
				set:self.set,
				get:self.get,
				setDefaults:self.setDefaults,
				setExtraChanMsg:self.setExtraChanMsg,
				getHTML:self.getHTML
			};
		})(),
		instant = (function(){
			var self = {
				id:Math.random().toString(36)+(new Date()).getTime().toString(),
				update:function(){
					ls.set('browserTab',self.id);
					ls.set('newInstant',false);
				},
				init:function(){
					ls.set('browserTab',self.id);
					$(window).focus(function(){
						self.update();
					}).unload(function(){
						ls.set('newInstant',true);
					})
				},
				current:function(){
					if(ls.get('newInstant')){
						self.update();
					}
					return self.id == ls.get('browserTab');
				}
			}
			return {
				init:self.init,
				current:self.current
			};
		}()),
		indicator = (function(){
			var self = {
				interval:false,
				$elem:false,
				start:function(){
					if(self.interval===false){
						pixels = [true,true,true,true,true,false,false,false];
						self.$elem = $('<div>')
							.attr('id','indicator')
							.css({
								position:'absolute',
								zIndex:44,
								margin:0,
								padding:0,
								top:0,
								right:0
							})
							.appendTo('body');
						self.interval = setInterval(function(){
							self.$elem.empty().append(
								$.map(pixels,function(p){
									return $('<div>')
										.css({
											padding:0,
											margin:0,
											width:3,
											height:3,
											backgroundColor:(p?'black':'')
										});
								})
							);
							var temp = pixels[0],
								i;
							for(i=1;i<=7;i++){
								pixels[(i-1)] = pixels[i];
							}
							pixels[7] = temp;
						},50);
					}
				},
				stop:function(){
					if(self.interval!==false){
						clearInterval(self.interval);
						self.interval = false;
						self.$elem.remove();
					}
				}
			};
			return {
				start:self.start,
				stop:self.stop
			};
		})(),
		notification = (function(){
			var self = {
				support_webkit:window.webkitNotifications!==undefined && window.webkitNotifications!==null && window.webkitNotifications,
				support:function(){
					return typeof Notification!='undefined' && Notification && Notification.permission!='denied';
				},
				show:function(s){
					var n;
					if(self.support_webkit){
						n = window.webkitNotifications.createNotification('omni.png','OmnomIRC Highlight',s);
						n.show();
					}else if(self.support()){
						n = new Notification('OmnomIRC Highlight',{
							icon:'omni.png',
							body:s
						});
						n.onshow = function(){
							setTimeout(n.close,30000);
						};
					}
				},
				request:function(){
					if(self.support_webkit){
						window.webkitNotifications.requestPermission(function(){
							if (window.webkitNotifications.checkPermission() === 0){
								show('Notifications Enabled!');
								options.set(7,true);
								document.location.reload();
							}
						});
					}else if(self.support()){
						Notification.requestPermission(function(status){
							if (Notification.permission !== status){
								Notification.permission = status;
							}
							if(status==='granted'){
								show('Notifications Enabled!');
								options.set(7,true);
								document.location.reload();
							}
						});
					}else{
						alert('Your browser doesn\'t support notifications');
					}
				},
				make:function(s,c){
					if(instant.current()){
						if(options.get('browserNotifications')){
							self.show(s);
						}
						if(options.get('ding')){
							$('#ding')[0].play();
						}
						if(c!=channels.current().handler){
							channels.highlight(c,true);
						}
					}else{
						if(c!=channels.current().handler){
							channels.highlight(c);
						}
					}
				}
			};
			return {
				request:self.request,
				make:self.make
			};
		})(),
		request = (function(){
			var self = {
				ws:{
					socket:false,
					connected:false,
					use:true,
					sendBuffer:[],
					allowLines:false,
					enabled:false,
					host:'',
					port:0,
					ssl:true,
					tryFallback:true,
					fallback:function(){
						if(self.ws.tryFallback){
							try{
								self.ws.tryFallback = false;
								self.ws.socket.close();
							}catch(e){}
							network.getJSON('omnomirc.php?getcurline&noLoginErrors',function(data){
								channels.current().reloadUserlist(); // this is usually a good idea.
								self.setCurLine(data.curline);
								use = false;
								self.old.lastSuccess = (new Date).getTime();
								self.old.start();
							});
						}
					},
					identify:function(){
						self.ws.send($.extend({action:'ident'},settings.getIdentParams()));
					},
					init:function(){
						if(!("WebSocket" in window) || !self.ws.enabled){
							self.ws.use = false;
							return false;
						}
						try{
							self.ws.socket = new WebSocket((self.ws.ssl?'wss://':'ws://')+self.ws.host+':'+self.ws.port.toString());
						}catch(e){
							console.log(self.ws.socket);
							console.log((ssl?'wss://':'ws://')+self.ws.host+':'+self.ws.port.toString());
							console.log(e);
							self.ws.fallback();
						}
						self.ws.socket.onopen = function(e){
							self.ws.connected = true;
							for(var i = 0;i < self.ws.sendBuffer.length;i++){
								self.ws.send(self.ws.sendBuffer[i]);
							}
							self.ws.sendBuffer = [];
						};
						self.ws.socket.onmessage = function(e){
							try{
								var data = JSON.parse(e.data);
								console.log(data);
								if(self.ws.allowLines && data.line!==undefined){
									if(!parser.addLine(data.line)){
										self.ws.tryFallback = false;
										self.ws.socket.close();
									}
								}
								if(data.relog!==undefined && data.relog!=0){
									settings.fetch(function(){
										self.ws.identify();
									},true);
								}
							}catch(e){};
						};
						self.ws.socket.onclose = function(e){
							self.ws.use = false;
							self.ws.fallback();
						};
						self.ws.socket.onerror = function(e){
							self.ws.socket.close();
							self.ws.use = false;
							self.ws.fallback();
						};
						
						self.ws.identify();
						
						$(window).on('beforeunload',function(){
							self.ws.socket.close();
						});
						return true;
					},
					send:function(msg){
						if(self.ws.connected){
							self.ws.socket.send(JSON.stringify(msg));
						}else{
							self.ws.sendBuffer.push(msg);
						}
					}
				},
				old:{
					inRequest:false,
					handler:false,
					lastSuccess:(new Date).getTime(),
					sendRequest:function(){
						if(!channels.current().loaded()){
							return;
						}
						self.old.handler = network.getJSON(
								'Update.php?high='+
								options.get('charsHigh').toString()+
								'&channel='+channels.current().handlerB64+
								'&lineNum='+self.curLine.toString(),
							function(data){
								var newRequest = true;
								if(!channels.current().loaded()){
									return;
								}
								self.old.handler = false;
								self.old.lastSuccess = (new Date).getTime();
								if(data.lines!==undefined){
									$.each(data.lines,function(i,line){
										return newRequest = parser.addLine(line);
									});
								}
								if(data.banned === true){
									newRequest = false;
								}
								if(newRequest){
									self.old.setTimer();
								}
							})
							.fail(function(){
								self.old.handler = false;
								if((new Date).getTime() >= self.old.lastSuccess + 300000){
									send.internal('<span style="color:#C73232;">OmnomIRC has lost connection to server. Please refresh to reconnect.</span>');
								}else if(!self.old.inRequest){
									self.old.lastSuccess = (new Date).getTime();
								}else{
									self.old.setTimer();
								}
							});
					},
					setTimer:function(){
						if(channels.current().loaded() && self.old.handler===false){
							setTimeout(function(){
								self.old.sendRequest();
							},(page.isBlurred()?2500:200));
						}else{
							self.old.stop();
						}
					},
					start:function(){
						if(!self.old.inRequest){
							self.old.inRequest = true;
							self.old.setTimer();
						}
					},
					stop:function(){
						if(self.old.inRequest){
							self.old.inRequest = false;
							try{
								self.old.handler.abort();
							}catch(e){}
						}
					},
					send:function(s,fn){
						self.old.stop();
						network.getJSON('message.php?message='+base64.encode(s)+'&channel='+channels.current().handlerB64,function(){
							self.old.start();
							if(fn!==undefined){
								fn();
							}
						});
					}
				},
				curLine:0,
				setChan:function(c){
					if(self.ws.use){
						self.ws.send({
							action:'chan',
							chan:c
						});
					}
				},
				stop:function(){
					if(self.ws.use){
						self.ws.allowLines = false;
					}else{
						self.old.stop();
					}
				},
				start:function(){
					if(self.ws.use){
						self.ws.allowLines = true;
					}else{
						self.old.start();
					}
				},
				setCurLine:function(c){
					if(c > self.curLine){
						self.curLine = c;
					}
				},
				send:function(s,fn){
					if(self.ws.use){
						self.ws.send({
							action:'message',
							message:s
						});
						if(fn!==undefined){
							fn();
						}
					}else{
						self.old.send(s,fn);
					}
				},
				setData:function(enabled,host,port,ssl){
					self.ws.enabled = enabled;
					self.ws.host = host;
					self.ws.port = port;
					self.ws.ssl = ssl;
				},
				init:function(){
					if(self.ws.enabled){
						self.ws.init();
					}
				}
			};
			return {
				setChan:self.setChan,
				start:self.start,
				stop:self.stop,
				setCurLine:self.setCurLine,
				send:self.send,
				setData:self.setData,
				init:self.init
			};
		})(),
		channels = (function(){
			var Channel = function(i,_parent){
					var exists = _parent.chans[i]!==undefined,
						self = {
							i:i,
							name:exists?_parent.chans[i].chan.toLowerCase():'',
							handler:exists?_parent.getHandler(i):-1,
							handlerB64:exists?_parent.getHandler(i,true):-1,
							loaded:false,
							load:function(data,fn){
								if(data.lines === undefined){ // something went wrong....
									if(data.message){
										send.internal(data.message);
									}else{
										send.internal('<span style="color:#C73232;"><b>ERROR:</b> couldn\'t join channel</span>');
									}
									return false;
								}
								options.set('curChan',i);
								if(data.banned){
									send.internal('<span style="color:#C73232;"><b>ERROR:</b> banned</span>');
									return false;
								}
								if(data.admin){
									$('#adminLink').css('display','');
								}else{
									$('#adminLink').css('display','none');
								}
								if(data.ignores!==undefined){
									parser.setIgnoreList(data.ignores);
								}
								users.setUsers(data.users);
								users.draw();
								$.each(data.lines,function(i,line){
									parser.addLine(line,true);
								});
								scroll.down();
								self.loaded = true;
								return true;
							},
							part:function(){
								_parent.part(self.i);
							},
							reloadUserlist:function(i){
								if(!exists){
									return;
								}
								network.getJSON('Load.php?userlist&channel='+self.handlerB64,function(data){
									if(!data.banned){
										users.setUsers(data.users);
										users.draw();
									}else{
										send.internal('<span style="color:#C73232;"><b>ERROR:</b> banned</span>');
									}
								});
							},
							reload:function(){
								_parent.join(self.i);
							}
						};
					return {
						name:self.name,
						handler:self.handler,
						handlerB64:self.handlerB64,
						load:self.load,
						part:self.part,
						reloadUserlist:self.reloadUserlist,
						reload:self.reload,
						loaded:function(){
							return self.loaded;
						}
					};
				},
				self = {
					chans:[],
					current:false,
					save:function(){
						ls.set('channels',self.chans);
					},
					load:function(){
						try{
							var chanList = ls.get('channels'),
								exChans = $.map(chans,function(ch){
									if((ch.ex && options.get('extraChans')) || !ch.ex){
										return ch;
									}
									return undefined;
								}),
								exChansInUse = [];
							if(chanList!==null && chanList!=[]){
								self.chans = $.merge(
										$.map(chanList,function(v){
											if(v.id != -1){
												var valid = false;
												$.each(self.chans,function(i,vc){
													if(vc.id == v.id){
														exChansInUse.push(v);
														valid = true;
														v.chan = vc.chan;
														return false;
													}
												});
												if(!valid){
													return undefined;
												}
											}
											return v;
										}),
										$.map(exChans,function(v){
											var oldChan = false;
											$.each(exChansInUse,function(i,vc){
												if(vc.id == v.id){
													oldChan = true;
													v.chan = vc.chan;
													return false
												}
											});
											if(oldChan){
												return undefined;
											}
											return v;
										})
									);
								save();
							}
						}catch(e){}
					},
					draw:function(){
						var mouseX = 0, // new closur as in map
							startX = 0,
							initDrag = false,
							offsetX = 0,
							canClick = false,
							width = 0,
							startDrag = function(elem){
								width = $(elem).width();
								canClick = false;
								$(elem).css({
										'position':'absolute',
										'z-index':100,
										'left':mouseX - offsetX
									})
									.after(
										$('<div>')
											.attr('id','topicDragPlaceHolder')
											.css({
												'display':'inline-block',
												'width':width
											})
									)
									.addClass('dragging')
									.find('div').css('display','block').focus();
								initDrag = false;
							},
							mousedownFn = function(e,elem){
								e.preventDefault();
								startX = e.clientX;
								offsetX = startX - $(elem).position().left;
								initDrag = true;
							},
							mousemoveFn = function(e,elem){
								mouseX = e.clientX;
								if(initDrag && Math.abs(mouseX - startX) >= 4){
									initDrag = false;
									startDrag(elem);
									e.preventDefault();
								}else if($(elem).hasClass('dragging')){
									var newX = mouseX - offsetX;
									$(elem).css('left',newX);
									$ne = $('#topicDragPlaceHolder').next('.chanList');
									$pe = $('#topicDragPlaceHolder').prev('.chanList');
									if($ne.length > 0 && ($ne.position().left) < (newX + (width/2))){
										$ne.after($('#topicDragPlaceHolder').remove());
									}else if($pe.length > 0){
										if($pe.attr('id') == $(elem).attr('id')){ // we selected our own element!
											$pe = $pe.prev();
										}
										if($pe.length > 0 && $pe.position().left > newX){
											$pe.before($('#topicDragPlaceHolder').remove());
										}
									}
								}
							},
							mouseupFn = function(e,elem){
								if(initDrag){
									initDrag = false;
								}else{
									$(elem).find('div').css('display','none');
									$('#topicDragPlaceHolder').replaceWith(elem);
									chans = $.map($('.chanList'),function(chan,i){
										if($(chan).find('span').hasClass('curchan')){
											options.set(4,i);
										}
										return $(chan).data('json');
									});
									save();
									draw();
								}
							};
						$('#ChanList').empty().append(
							$.map(self.chans,function(c,i){
								if((c.ex && options.get('extraChans')) || !c.ex){
									return $('<div>')
										.data('json',c)
										.attr('id','chan'+i.toString())
										.addClass('chanList'+(c.high?' highlightChan':''))
										.append(
											$('<span>')
												.addClass('chan '+(i==self.current.i?' curchan':''))
												.append(
													(c.chan.substr(0,1)!='#'?
													$('<span>')
														.addClass('closeButton')
														.css({
															width:9,
															float:'left'
														})
														.mouseup(function(){
															if(canClick){
																channels.part(i);
															}
														})
														.text('x')
													:''),
													$('<span>').text(c.chan)
												)
												.mouseup(function(){
													if(canClick){
														channels.join(i);
													}
												}),
											$('<div>')
												.css({
													'position':'fixed',
													'width':'100%',
													'height':'100%',
													'z-index':101,
													'top':0,
													'left':0,
													'display':'none'
												})
												.mousemove(function(e){
													mousemoveFn(e,$(this).parent());
												})
												.mouseup(function(e){
													mouseupFn(e,$(this).parent());
												})
												.mouseout(function(e){
													mouseupFn(e,$(this).parent());
												})
										)
										.mousedown(function(e){
											canClick = true;
											mousedownFn(e,this);
										})
										.mousemove(function(e){
											mousemoveFn(e,this);
										})
										.mouseout(function(e){
											if(initDrag){
												startDrag(this);
											}
										})
										.mouseup(function(e){
											mouseupFn(e,this);
										});
								}
							})
						);
					},
					init:function(){
						self.load();
						self.draw();
						self.current = Channel(-1,self);
					},
					getHandler:function(i,b64){
						if(self.chans[i].id!=-1){
							return self.chans[i].id.toString();
						}
						if(b64){
							return base64.encode(self.chans[i].chan);
						}
						return self.chans[i].chan;
					},
					requestHandler:false,
					join:function(i,fn){
						if(self.chans[i]===undefined){ // this channel doesn't exist!
							return;
						}
						indicator.start();
						request.stop();
						$('#message').attr('disabled','true');
						$('#MessageBox').empty();
						$('.chan').removeClass('curchan');
						if(self.requestHandler!==false){
							self.requestHandler.abort();
						}
						self.requestHandler = network.getJSON('Load.php?count=125&channel='+self.getHandler(i,true),function(data){
							self.current = Channel(i,self);
							if(self.current.load(data,fn)){
								request.setChan(self.getHandler(i));
								request.start();
								
								self.chans[i].high = false;
								self.save();
								tab.load();
								
								if(settings.loggedIn()){
									$('#message').removeAttr('disabled');
								}
							}
							self.requestHandler = false;
							$('#chan'+i.toString()).removeClass('highlightChan').find('.chan').addClass('curchan');
							
							if(fn!==undefined){
								fn();
							}
							indicator.stop();
						})
					},
					highlight:function(c,doSave){
						$.each(self.chans,function(i,ci){
							if(c == ci.id || ci.chan.toLowerCase()==c.toString().toLowerCase()){
								$('#chan'+i.toString()).addClass('highlightChan');
								self.chans[i].high = true;
							}
						});
						if(doSave!==undefined && doSave){
							self.save();
						}
					},
					addChan:function(s,join){
						s = s.toLowerCase();
						$.each(chans,function(i,c){
							if(c.chan==s){
								addChan = i;
							}
						});
						if(addChan===true){
							self.chans.push({
								chan:s,
								high:!join,
								ex:false,
								id:-1,
								order:-1
							});
							self.save();
							self.draw();
							if(join){
								self.join(self.chans.length-1);
							}
						}else{
							chans[addChan].high |= !join;
							if(join){
								self.join(addChan);
							}
						}
					},
					open:function(s){
						var addChan = true;
						s = s.trim();
						if(s.substr(0,1) != '@' && s.substr(0,1) != '#'){
							s = '@' + s;
						}
						// s will now be either prefixed with # or with @
						self.addChan(s,true);
					},
					openPm:function(s,join){
						var addChan = true;
						if(join===undefined){
							join = false;
						}
						s = s.trim();
						if(s.substr(0,1)=='@' || s.substr(0,1)=='#'){
							send.internal('<span style="color:#C73232;"> Query Error: Cannot query a channel. Use /join instead.</span>');
							return;
						}
						s = s.toLowerCase();
						if(s.substr(0,1)!='*'){
							s = '*'+s;
						}
						// s will now be prefixed with *
						self.addChan(s,join);
					},
					part:function(i){
						var select = false;
						if(parseInt(i,10) == i){ // we convert it to a number so that we don't have to deal with it
							i = parseInt(1,10);
						}
						if((typeof i)!='number'){
							// a string was passed, we need to get the correct i
							$.each(self.chans,function(ci,c){
								if(c.chan == i){
									i = ci;
								}
							});
						}
						if((typeof i)!='number' || self.chans[i] !== undefined){ // we aren#t in the channel
							send.internal('<span style="color:#C73232;"> Part Error: I cannot part '+i+'. (You are not in it.)</span>');
							return;
						}
						if(self.chans[i].chan.substr(0,1)=='#'){
							send.internal('<span style="color:#C73232;"> Part Error: I cannot part '+self.chans[i].chan+'. (IRC channel.)</span>');
							return;
						}
						if(i == self.current.i){
							select = true;
						}
						self.chans.splice(i,1);
						self.save();
						self.draw();
						if(select){
							self.join(i-1);
						}
					},
					getNames:function(){
						return $.map(self.chans,function(c){
							return c.chan;
						});
					},
					setChans:function(c){
						self.chans = c;
					}
				};
			return {
				highlight:self.highlight,
				join:self.join,
				current:function(){
					return self.current;
				},
				open:self.open,
				openPm:self.openPm,
				part:self.part,
				getNames:self.getNames,
				init:self.init,
				setChans:self.setChans
			};
		})(),
		tab = (function(){
			var tabWord = '',
				tabCount = 0,
				isInTab = false,
				startPos = 0,
				startChar = '',
				endPos = 0,
				endChar = '',
				endPos0 = 0,
				tabAppendStr = ' ',
				searchArray = [],
				node;
				getCurrentWord = function(){
					var messageVal = (!wysiwyg.support()?$('#message')[0].value:(node = window.getSelection().anchorNode).nodeValue);
					if(isInTab){
						return tabWord;
					}
					startPos = (!wysiwyg.support()?$('#message')[0].selectionStart:window.getSelection().anchorOffset);
					startChar = messageVal.charAt(startPos);
					while(startChar != ' ' && --startPos > 0){
						startChar = messageVal.charAt(startPos);
					}
					if(startChar == ' '){
						startPos++;
					}
					endPos = (!wysiwyg.support()?$('#message')[0].selectionStart:window.getSelection().anchorOffset);
					endChar = messageVal.charAt(endPos);
					while(endChar != ' ' && ++endPos <= messageVal.length){
						endChar = messageVal.charAt(endPos);
					}
					endPos0 = endPos;
					tabWord = messageVal.substr(startPos,endPos - startPos).trim();
					return tabWord;
				},
				getTabComplete = function(){
					var messageVal = (!wysiwyg.support()?$('#message')[0].value:node.nodeValue),
						name;
					if(messageVal === null){
						return;
					}
					name = search(getCurrentWord(),tabCount);
					if(!isInTab){
						tabAppendStr = ' ';
						if(startPos===0){
							tabAppendStr = ': ';
						}
					}
					if(name == getCurrentWord()){
						tabCount = 0;
						name = search(getCurrentWord(),tabCount);
					}
					messageVal = messageVal.substr(0,startPos)+name+tabAppendStr+messageVal.substr(endPos+1);
					if(!wysiwyg.support()){
						$('#message')[0].value = messageVal;
					}else{
						window.getSelection().anchorNode.nodeValue = messageVal;
						window.getSelection().getRangeAt(0).setEnd(node,startPos+name.length+tabAppendStr.length);
						window.getSelection().getRangeAt(0).setStart(node,startPos+name.length+tabAppendStr.length);
					}
					endPos = endPos0+name.length+tabAppendStr.length;
				},
				search = function(start,startAt){
					var res = false;
					if(!startAt){
						startAt = 0;
					}
					$.each(searchArray,function(i,u){
						if(u.toLowerCase().indexOf(start.toLowerCase()) === 0 && startAt-- <= 0 && res === false){
							res = u;
						}
					});
					if(res!==false){
						return res;
					}
					return start;
				};
			return {
				init:function(){
					$('#message')
						.keydown(function(e){
							if(e.keyCode == 9){
								if(!e.ctrlKey){
									e.preventDefault();
									
									getTabComplete();
									isInTab = true;
									tabCount++;
									setTimeout(1,1);
								}
							}else{
								tabWord = '';
								tabCount = 0;
								isInTab = false;
							}
						});
				},
				load:function(){
					searchArray = $.merge(users.getNames(),channels.getNames());
				}
			};
		})(),
		users = (function(){
			var self = {
				users:[],
				exists:function(e){
					var result = false;
					$.each(self.users,function(i,us){
						if(us.nick.toLowerCase() == u.nick.toLowerCase() && us.network == u.network){
							result = true;
							return false;
						}
					});
					return result;
				},
				add:function(u){
					if(channels.current().handler!==''){
						self.users.push(u);
						self.draw();
					}
				},
				remove:function(u){
					if(channels.current().handler!==''){
						$.each(self.users,function(i,us){
							if(us.nick == u.nick && us.network == u.network){
								self.users.splice(i,1);
								return false;
							}
						});
						self.draw();
					}
				},
				draw:function(){
					self.users.sort(function(a,b){
						var al = a.nick.toLowerCase(),
							bl = b.nick.toLowerCase();
						return al==bl?(a==b?0:a<b?-1:1):al<bl?-1:1;
					});
					$('#UserList').empty().append(
						$.map(self.users,function(u){
							var getInfo,
								ne = encodeURIComponent(u.nick),
								n = $('<span>').text(u.nick).html();
							return $('<span>')
								.attr('title',settings.getNetwork(u.network).name)
								.append(
									settings.getNetwork(u.network).userlist.split('NICKENCODE').join(ne).split('NICK').join(n),
									'<br>'
								)
								.mouseover(function(){
									getInfo = network.getJSON('Load.php?userinfo&name='+base64.encode(u.nick)+'&chan='+channels.current().handlerB64+'&online='+u.network.toString(),function(data){
										if(data.last){
											$('#lastSeenCont').text('Last Seen: '+(new Date(data.last*1000)).toLocaleString());
										}else{
											$('#lastSeenCont').text('Last Seen: never');
										}
										$('#lastSeenCont').css('display','block');
									},undefined,false);
								})
								.mouseout(function(){
									try{
										getInfo.abort();
									}catch(e){}
									$('#lastSeenCont').css('display','none');
								});
						}),
						'<br><br>'
					);
				},
				setUsers:function(u){
					self.users = u;
				},
				getNames:function(){
					return $.map(self.users,function(u){
						return u.nick;
					});
				}
			};
			return {
				add:self.add,
				remove:self.remove,
				draw:self.draw,
				setUsers:self.setUsers,
				getNames:self.getNames
			};
		})(),
		topic = (function(){
			var self = {
				set:function(t){
					$('#topic').empty().append(t);
				}
			};
			return {
				set:self.set
			};
		})(),
		scroll = (function(){
			var isDown = false,
				is_touch = (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)),
				headerOffset = 0,
				$mBox = false,
				$mBoxCont = false,
				touchScroll = function($elem,fn){
					var lastY = -1;
					$elem.bind('touchstart',function(e){
						if($(e.target).is('a')){
							return;
						}
						$mBox.css('transition','none');
						e.preventDefault();
						lastY = e.originalEvent.touches[0].clientY;
					}).bind('touchmove',function(e){
						if($(e.target).is('a')){
							return;
						}
						e.preventDefault();
						if(lastY == -1){
							return;
						}
						var y = e.originalEvent.changedTouches[0].clientY;
						fn(y - lastY);
						lastY = y;
					}).bind('touchend touchcancel touchleave',function(e){
						if($(e.target).is('a')){
							return;
						}
						$mBox.css('transition','');
						e.preventDefault();
						lastY = -1;
					});
				},
				enableButtons = function(){
					var addHook = function(elem,effect,inc){
							var interval;
							$(elem)
								.mousedown(function(){
									interval = setInterval(function(){
										document.getElementById(effect).scrollLeft += inc;
									},50);
								})
								.mouseup(function(){
									try{
										clearInterval(interval);
									}catch(e){}
								})
								.mouseout(function(){
									try{
										clearInterval(interval);
									}catch(e){}
								});
							if(is_touch){
								$(elem).bind('touchstart',function(){
									interval = setInterval(function(){
										document.getElementById(effect).scrollLeft += inc;
									},50);
								}).bind('touchend touchcancel touchleave',function(e){
									try{
										clearInterval(interval);
									}catch(e){}
								});
							}
						};
					addHook('#arrowLeftChan','ChanListCont',-9);
					addHook('#arrowRightChan','ChanListCont',9);
					
					addHook('#arrowLeftTopic','topicCont',-9);
					addHook('#arrowRightTopic','topicCont',9);
				},
				moveWindow = function(delta){
					var oldTop = -parseInt($mBox[0].style.top,10),
						maxScroll = $mBox.height() - $mBoxCont.height(),
						newTop = Math.min(maxScroll,Math.max(0,oldTop - delta));
					isDown = false;
					$mBox.css('top',-newTop)
					if(newTop==maxScroll){
						isDown = true;
					}
					if(options.get('scrollBar')){
						reCalcBar();
					}
				},
				enableWheel = function(){
					$mBoxCont.bind('DOMMouseScroll mousewheel',function(e){
						var oldTop = $mBox[0].style.top;
						moveWindow((/Firefox/i.test(navigator.userAgent)?(e.originalEvent.detail*(-20)):(e.originalEvent.wheelDelta/2)));
						//if(oldTop != $mBox[0].style.top){
							e.preventDefault();
							e.stopPropagation();
							e.cancelBubble = true;
						//}
					});
					if(is_touch){
						touchScroll($mBoxCont,function(d){
							moveWindow(d);
						});
					}
				},
				reCalcBar = function(){
					if($('#scrollBar').length!==0){
						if($mBox.height() <= $mBoxCont.height()){
							$('#scrollBar').css('top',headerOffset);
						}else{
							$('#scrollBar').css('top',(parseInt($mBox[0].style.top,10)/($mBoxCont.height() - $mBox.height()))*($('body')[0].offsetHeight-$('#scrollBar')[0].offsetHeight-headerOffset)+headerOffset);
						}
					}
				},
				enableUserlist = function(){
					var moveUserList = function(delta,self){
							$(self).css('top',Math.min(0,Math.max(((/Opera/i.test(navigator.userAgent))?-30:0)+document.getElementById('UserListInnerCont').clientHeight-self.scrollHeight,delta+parseInt($('#UserList').css('top'),10))));
						};
					$('#UserList')
						.css('top',0)
						.bind('DOMMouseScroll mousewheel',function(e){
							if(e.preventDefault){
								e.preventDefault();
							}
							e = e.originalEvent;
							moveUserList((/Firefox/i.test(navigator.userAgent)?(e.detail*(-20)):(e.wheelDelta/2)),this);
						});
					if(is_touch){
						touchScroll($('#UserList'),function(d){
							moveUserList(d,this);
						});
					}
				},
				showBar = function(){
					var mouseMoveFn = function(y){
							var newscrollbartop = 0;
							if($bar.data('isClicked')){
								newscrollbartop = parseInt($bar.css('top'),10)+(y-$bar.data('prevY'));
								
								$mBox.css('top',-((newscrollbartop-headerOffset)/($('body')[0].offsetHeight-$bar[0].offsetHeight-headerOffset))*($mBox.height() - $mBoxCont.height()));
								isDown = false;
								if(newscrollbartop<headerOffset){
									newscrollbartop = headerOffset;
									$mBox.css('top',0);
								}
								if(newscrollbartop>($('body')[0].offsetHeight-$bar[0].offsetHeight)){
									newscrollbartop = $('body')[0].offsetHeight-$bar[0].offsetHeight;
									$mBox.css('top',$mBoxCont.height() - $mBox.height());
									isDown = true;
								}
								$bar.css('top',newscrollbartop);
							}
							$bar.data('prevY',y);
						},
						mouseDownFn = function(){
							$bar.data('isClicked',true);
							$('#scrollArea').css('display','block');
							$mBox.css('transition','none');
						},
						mouseUpFn = function(){
							$bar.data('isClicked',false);
							$('#scrollArea').css('display','none');
							$mBox.css('transition','');
						},
						$bar = $('<div>').attr('id','scrollBar').data({prevY:0,isClicked:false}).appendTo('body')
							.mousemove(function(e){
								mouseMoveFn(e.clientY);
							})
							.mousedown(function(){
								mouseDownFn();
							})
							.mouseup(function(){
								mouseUpFn();
							}),
						$tmp;
					$bar.css('top',$('body')[0].offsetHeight-$bar[0].offsetHeight);
					$tmp = $('<div>')
						.attr('id','scrollArea')
						.css({
							display:'none',
							width:'100%',
							height:'100%',
							position:'absolute',
							cursor:'move',
							left:0,
							top:0,
							zIndex:100
						})
						.mousemove(function(e){
							mouseMoveFn(e.clientY);
						})
						.mouseup(function(){
							mouseUpFn();
						})
						.mouseout(function(){
							mouseUpFn();
						});
					if(is_touch){
						$tmp.bind('touchend touchcancel touchleave',function(e){
							mouseUpFn();
						}).bind('touchmove',function(e){
							e.preventDefault();
							mouseMoveFn(e.originalEvent.changedTouches[0].clientY);
						});
						$bar.bind('touchstart',function(e){
							e.preventDefault();
							mouseDownFn();
						}).bind('touchmove',function(e){
							e.preventDefault();
							mouseMoveFn(e.originalEvent.changedTouches[0].clientY);
						}).bind('touchend touchcancel touchleave',function(e){
							e.preventDefault();
							mouseUpFn(e);
						});
					}
					$tmp.appendTo('body');
					$('<div>')
						.attr('id','scrollBarLine')
						.appendTo('body');
					$(window).trigger('resize');
				},
				showButtons = function(){
					var downIntM,
						upIntM,
						downIntMfn = function(){
							downIntM = setInterval(function(){
								moveWindow(9);
							},50);
						},
						upIntMfn = function(){
							upIntM = setInterval(function(){
								moveWindow(-9);
							},50);
						},
						$tmp;
					$tmp = $('<span>')
						.addClass('arrowButtonHoriz3')
						.append(
							$('<div>')
								.css({
									fontSize:'12pt',
									width:12,
									height:'12pt',
									top:0,
									position:'absolute',
									fontWeight:'bolder',
									marginTop:'10pt',
									marginLeft:'-10pt'
								})
								.addClass('arrowButtonHoriz2')
								.html('&#9650;'),
							$('<div>')
								.css({
									fontSize:'12pt',
									width:12,
									height:'9pt',
									top:0,
									position:'absolute',
									marginTop:'10pt',
									marginLeft:'-10pt'
								})
								.mousedown(function(){
									$mBox.css('transition','none');
									downIntMfn();
								})
								.mouseout(function(){
									$mBox.css('transition','');
									try{
										clearInterval(downIntM);
									}catch(e){}
								})
								.mouseup(function(){
									$mBox.css('transition','');
									try{
										clearInterval(downIntM);
									}catch(e){}
								})
						);
					if(is_touch){
						$tmp.bind('touchstart',function(){
							downIntMfn();
						}).bind('touchend touchcancel touchleave',function(e){
							try{
								clearInterval(downIntM);
							}catch(e){}
						});
					}
					$tmp.appendTo('body');
					
					$tmp = $('<span>')
						.addClass('arrowButtonHoriz3')
						.append(
							$('<div>')
								.css({
									fontSize:'12pt',
									width:12,
									height:'12pt',
									bottom:'6pt',
									position:'absolute',
									fontWeight:'bolder',
									marginTop:'-10pt',
									marginLeft:'-10pt'
								})
								.addClass('arrowButtonHoriz2')
								.html('&#9660;'),
							$('<div>')
								.css({
									fontSize:'12pt',
									width:12,
									height:'9pt',
									bottom:'9pt',
									position:'absolute',
									marginTop:'-10pt',
									marginLeft:'-10pt'
								})
								.mousedown(function(){
									$mBox.css('transition','none');
									upIntMfn();
								})
								.mouseout(function(){
									$mBox.css('transition','');
									try{
										clearInterval(upIntM);
									}catch(e){}
								})
								.mouseup(function(){
									$mBox.css('transition','');
									try{
										clearInterval(upIntM);
									}catch(e){}
								})
						);
					if(is_touch){
						$tmp.bind('touchstart',function(){
							upIntMfn();
						}).bind('touchend touchcancel touchleave',function(e){
							try{
								clearInterval(upIntM);
							}catch(e){}
						});
					}
					$tmp.appendTo('body');
				};
			return {
				down:function(){
					$mBox.css('top',$mBoxCont.height() - $mBox.height()); // reverse direction on subtraction to gain negativity
					reCalcBar();
					isDown = true;
				},
				up:function(){
					$mBox.css('top',0);;
					reCalcBar();
					isDown = false;
				},
				slide:function(){
					if(isDown){
						scroll.down();
					}
				},
				init:function(){
					$mBox = $('#MessageBox');
					$mBoxCont = $('#mBoxCont');
					enableButtons();
					headerOffset = $('#header').height() - 2;
					if(options.get('scrollBar')){
						showBar();
					}else{
						showButtons();
					}
					if(options.get('scrollWheel')){
						enableWheel();
					}
					enableUserlist();
					$(document).add(window).add('body').add('html').scroll(function(e){
						e.preventDefault();
					});
				},
				reCalcBar:reCalcBar
			};
		})(),
		wysiwyg = (function(){
			var sel,
				menuOpen = false,
				hideMenu = function(){
					$('#textDecoForm').css('display','none');
					menuOpen = false;
				 };
			return {
				init:function(){
					$('#message').mouseup(function(e){
						sel = window.getSelection();
						if(sel.isCollapsed){
							return;
						}
						e.preventDefault();
						$('#textDecoForm').css({
							display:'block',
							left:Math.max(e.pageX-52,0)
						});
						menuOpen = true;
						
						
					});
					$(document).mousedown(function(e){
						if(!$(e.target).closest('#textDecoForm').length && menuOpen){
							hideMenu();
						}
					})
					$('#textDecoFormBold').click(function(){
						sel.getRangeAt(0).surroundContents($('<b>')[0]);
					});
					$('#textDecoFormItalic').click(function(){
						sel.getRangeAt(0).surroundContents($('<i>')[0]);
					});
					$('#textDecoFormUnderline').click(function(){
						sel.getRangeAt(0).surroundContents($('<u>')[0]);
					});
				},
				getMsg:function(){
					var msg = $('#message').html();
					msg = msg.split('<b>').join('\x02').split('</b>').join('\x02');
					msg = msg.split('<i>').join('\x1d').split('</i>').join('\x1d');
					msg = msg.split('<u>').join('\x1f').split('</u>').join('\x1f');
					msg = msg.split('&nbsp;').join(' ');
					msg = $('<span>').html(msg).text();
					return msg;
				},
				support:function(){
					return (('contentEditable' in document.documentElement) && options.get('wysiwyg'));
				}
			}
		})(),
		page = (function(){
			var initSmileys = function(){
					if(options.get('smileys')){
						$('#smileyMenuButton')
							.css('cursor','pointer')
							.click(function(){
									if($('#smileyselect').css('display')=='block'){
										$('#smileyselect').css('display','none');
										$(this).attr('src','smileys/smiley.gif');
									}else{
										$('#smileyselect').css('display','block');
										$(this).attr('src','smileys/tongue.gif');
									}
							});
					}else{
						$('#smileyMenuButton')
							.attr('src','smileys/smiley_grey.png');
					}
					$('#smileyselect').append(
						$.map(parser.getSmileys(),function(s){
							return [(s.inMenu?($('<img>')
								.attr({
									src:s.pic,
									alt:s.alt,
									title:s.title
								})
								.click(function(){
									if(!wysiwyg.support()){
										replaceText(' '+s.code,$('#message')[0]);
									}else{
										var range = window.getSelection().getRangeAt(0);
										range.deleteContents();
										range.insertNode(document.createTextNode(' '+s.code));
									}
								})):''),' '];
								
						})
					);
				},
				mBoxContWidthOffset = 90,
				hide_userlist = false,
				show_scrollbar = true,
				registerToggle = function(){
					$('#toggleButton')
						.click(function(e){
							e.preventDefault();
							options.set('enable',!options.get('enable'));
							document.location.reload();
						});
				},
				isBlurred = false,
				calcResize = function(allowHeightChange){
					var htmlHeight = window.innerHeight,
						htmlWidth = window.innerWidth,
						headerHeight = $('#header').outerHeight(),
						footerHeight = $('#footer').outerHeight(),
						em = Number(getComputedStyle(document.body,'').fontSize.match(/(\d*(\.\d*)?)px/)[1]);
					if(allowHeightChange){
						$('#scrollBarLine').css('top',parseInt($('#header').outerHeight(),10));
						
						
						$('#mBoxCont').css('height',htmlHeight - footerHeight - headerHeight - 0.2*em);
						$('html,body').height(htmlHeight);
						
						$('#message').css('width',htmlWidth*(hide_userlist?1:0.91) - 12*em);
					}
					if(show_scrollbar){
						var widthOffset = (htmlWidth/100)*mBoxContWidthOffset;
						if(allowHeightChange){
							$('#mBoxCont').css('width',widthOffset-1.9*em);
						}
						$('#scrollBarLine').css('left',widthOffset - 1.4*em);
						if(allowHeightChange){
							$('#scrollBarLine').css('height',htmlHeight - headerHeight - 0.1*em);
						}
						$('#scrollBar').css('left',widthOffset - 1.5*em);
						scroll.reCalcBar();
					}
					scroll.down();
				},
				init = function(){
					var nua = navigator.userAgent,
						is_android = ((nua.indexOf('Mozilla/5.0') > -1 && nua.indexOf('Android ') > -1 && nua.indexOf('AppleWebKit') > -1) && !(nua.indexOf('Chrome') > -1)),
						is_ios = (nua.match(/(iPod|iPhone|iPad)/i) && nua.match(/AppleWebKit/i)),
						is_mobile_webkit = (nua.match(/AppleWebKit/i) && nua.match(/Android/i));
					$('body').css('font-size',options.get('fontSize').toString(10)+'pt');
					hide_userlist = options.get('hideUserlist');
					show_scrollbar = options.get('scrollBar');
					page.changeLinks();
					if(!wysiwyg.support()){
						$('#message').replaceWith(
							$('<input>')
								.attr({
									'type':'text',
									'id':'message',
									'accesskey':'i',
									'maxlen':'256',
									'autocomplete':'off'
								})
						);
					}else{
						$('#message').keydown(function(e){
							if(e.keyCode==13){
								e.preventDefault();
								$('#sendMessage').trigger('submit');
							}
						});
						wysiwyg.init();
					}
					if(hide_userlist){ // hide userlist is on
						mBoxContWidthOffset = 99;
						$('<style>')
							.append(
								'#mBoxCont{width:99%;}',
								'.arrowButtonHoriz2,.arrowButtonHoriz3 > div:nth-child(2){left:98%;left:calc(99% - 5px);left:-webkit-calc(99% - 5px);}',
								'#UserListContainer{left:99%;transition: left 0.5s 1s;-webkit-transition: left 0.5s 1s;-o-transition-property: left;-o-transition-duration: 0.5d;-o-transition-delay: ls;}',
								'#icons{right:95px;}'
							)
							.appendTo('head');
					}
					scroll.init();
					tab.init();
					instant.init();
					logs.init();
					registerToggle();
					if(is_ios){
						calcResize(true);
					}
					$(window).resize(function(){
						calcResize(!is_ios);
					}).trigger('resize').blur(function(){
						isBlurred = true;
					}).focus(function(){
						isBlurred = false;
					});
					$('#aboutButton').click(function(e){
						e.preventDefault();
						$('#about').toggle();
					});
				};
			return {
				load:function(){
					indicator.start();
					settings.fetch(function(){
						if(options.get('enable')){
							init();
							initSmileys();
							send.init();
							oldMessages.init();
							channels.init();
							request.init()
							channels.join(options.get('curChan'));
						}else{
							registerToggle();
							$('#mBoxCont').empty().append(
								'<br>',
								$('<a>')
									.css('font-size','20pt')
									.text('OmnomIRC is disabled. Click here to enable.')
									.click(function(e){
										e.preventDefault();
										options.set(5,true);
										window.location.reload();
									})
							);
							$('#footer,#header').css('display','none');
							indicator.stop();
						}
					});
				},
				isBlurred:function(){
					return isBlurred;
				},
				changeLinks:function(){
					// change links to add network
					$('#adminLink a,a[href="."],a[href="?options"],a[href="index.php"]').each(function(){
						if($(this).attr('href').split('?')[1] !== undefined){
							$(this).attr('href',$(this).attr('href')+'&network='+settings.net());
						}else{
							$(this).attr('href',$(this).attr('href')+'?network='+settings.net());
						}
					});
				}
			};
		})(),
		statusBar = (function(){
			var self = {
				text:'',
				started:false,
				start:function(){
					if(!options.get('statusBar')){
						self.started = true; // no need to performthe check 9001 times
						return;
					}
					if(!self.started){
						setInterval(function(){
							window.status = self.text;
							if(parent){
								try{
									parent.window.status = self.text;
								}catch(e){}
							}
						},500);
						self.started = true;
					}
				},
				set:function(s){
					self.text = s;
					if(!self.started){
						self.start();
					}
				}
			};
			return {
				set:self.set
			};
		})(),
		commands = (function(){
			var self = {
				parse:function(s){
					var command = s.split(' ')[0].toLowerCase(),
						parameters = s.substr(command.length+1).toLowerCase().trim();
					switch(command){
						case 'j':
						case 'join':
							channels.openChan(parameters);
							return true;
						case 'q':
						case 'query':
							channels.openPm(parameters,true);
							return true;
						case 'win':
						case 'w':
						case 'window':
							channels.join(parseInt(parameters,10));
							return true;
						case 'p':
						case 'part':
							channels.part((parameters!==''?parameters:undefined));
							return true;
						case 'help':
							send.internal('<span style="color:#2A8C2A;">Commands: me, ignore, unignore, ignorelist, join, part, query, msg, window</span>');
							send.internal('<span style="color:#2A8C2A;">For full help go here: <a href="http://ourl.ca/19926" target="_top">http://ourl.ca/19926</a></span>');
							return true;
						case 'ponies':
							$.getScript('https://juju2143.ca/mousefly.js',function(){
								Derpy();
							});
							return true;
						case 'minty':
							$.getJSON(OMNOMIRCSERVER+'/minty.php').done(function(data){
								send.internal('<span style="font-size:5px;line-height:0;font-family:monospace;">'+data.minty+'</span>');
							});
							return true;
						default:
							return false;
					}
				}
			};
			return {
				parse:self.parse
			};
		})(),
		oldMessages = (function(){
			var messages = [],
				counter = 0,
				current = '',
				setMsg = function(s){
					if(!wysiwyg.support()){
						$('#message').val(s);
					}else{
						$('#message').html(s);
					}
				},
				getMsg = function(){
					if(!wysiwyg.support()){
						return $('#message').val();
					}
					return $('#message').html();
				};
			return {
				init:function(){
					$('#message')
						.keydown(function(e){
							if(e.keyCode==38 || e.keyCode==40){
								e.preventDefault();
								if(counter==messages.length){
									current = getMsg();
								}
								if(messages.length!==0){
									if(e.keyCode==38){ //up
										if(counter!==0){
											counter--;
										}
										setMsg(messages[counter]);
									}else{ //down
										if(counter!=messages.length){
											counter++;
										}
										if(counter==messages.length){
											setMsg(current);
										}else{
											setMsg(messages[counter]);
										}
									}
								}
							}
						});
				},
				add:function(s){
					messages.push(s);
					if(messages.length>20){
						messages.shift();
					}
					counter = messages.length;
					ls.set('oldMessages-'+channels.current().handlerB64,messages);
				},
				read:function(){
					messages = ls.get('oldMessages-'+channels.current().handlerB64);
					if(!messages){
						messages = [];
					}
					console.log(messages);
					counter = messages.length;
				}
			};
		})(),
		send = (function(){
			var sending = false,
				sendMessage = function(s){
					if(s[0] == '/' && commands.parse(s.substr(1))){
						if(!wysiwyg.support()){
							$('#message').val('');
						}else{
							$('#message').html('');
						}
					}else{
						if(!sending){
							sending = true;
							request.send(s,function(){
								if(!wysiwyg.support()){
									$('#message').val('');
								}else{
									$('#message').html('');
								}
								sending = false;
							});
						}
					}
				};
			return {
				internal:function(s){
					parser.addLine({
						curLine:0,
						type:'internal',
						time:Math.floor((new Date()).getTime()/1000),
						name:'',
						message:s,
						name2:'',
						chan:channels.current().handler
					});
				},
				init:function(){
					
					$('#sendMessage')
						.submit(function(e){
							e.preventDefault();
							if(settings.loggedIn()){
								var val = '';
								if(!wysiwyg.support()){
									val = $('#message').val();
									
									oldMessages.add(val);
								}else{
									oldMessages.add($('#message').html());
									val = wysiwyg.getMsg();
								}
								console.log(val);
								val = parser.parseTextDecorations(val);
								if(!$('#message').attr('disabled') && val!==''){
									sendMessage(val);
									$('#message').focus(); // fix IE not doing that automatically
								}
							}
						});
					if(!settings.loggedIn()){
						$('#message')
							.val('You need to login if you want to chat!');
					}
				}
			};
		})(),
		logs = (function(){
			var isOpen = false,
				year = 0,
				month = 0,
				day = 0,
				months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
				getLogUrlParam = function(){
					return base64.encode(year.toString(10)+'-'+month.toString(10)+'-'+day.toString(10));
				},
				updateInputVal = function(){
					$('#logDate').val(months[month-1]+' '+day.toString(10)+' '+year.toString(10));
				},
				displayDatePicker = function(){
					var d = new Date(year,month,day),
						week = ['Sun','Mon','Tue','Wen','Thu','Fri','Sat'],
						days = (new Date(year,month,0)).getDate(),
						firstDayOfWeek = (new Date(year,month-1,1)).getDay(),
						i = 0;
					if(day > days){
						day = days;
					}
					updateInputVal();
					$('#logDatePicker').empty().append(
						$('<a>').text('<').click(function(e){
							e.preventDefault();
							e.stopPropagation();
							year--;
							displayDatePicker();
						}),' ',year.toString(10),' ',
						$('<a>').text('>').click(function(e){
							e.preventDefault();
							e.stopPropagation();
							year++;
							displayDatePicker();
						}),'<br>',
						$('<a>').text('<').click(function(e){
							e.preventDefault();
							e.stopPropagation();
							month--;
							if(month < 1){
								month = 12;
								year--;
							}
							displayDatePicker();
						}),' ',months[month-1],' ',
						$('<a>').text('>').click(function(e){
							e.preventDefault();
							e.stopPropagation();
							month++;
							if(month > 12){
								month = 1;
								year++;
							}
							displayDatePicker();
						}),'<br>',
						$('<table>').append(
							$('<tr>').append(
								$.map(week,function(v){
									return $('<th>').text(v);
								})
							),
							$.map([0,1,2,3,4,5],function(){
								if(i >= days){
									return;
								}
								return $('<tr>').append(
									$.map([0,1,2,3,4,5,6],function(v){
										if((i == 0 && v!=firstDayOfWeek) || i >= days){
											return $('<td>').text(' ');
										}
										i++;
										return $('<td>').text(i).addClass('logDatePickerDay').addClass(i==day?'current':'').data('day',i).click(function(){
											$('.logDatePickerDay.current').removeClass('current');
											day = $(this).addClass('current').data('day');
											updateInputVal();
										});
									})
								);
							})
						)
					);
					$('#logDatePicker').css('display','block');
				},
				open = function(){
					var d = new Date();
					
					indicator.start();
					request.stop();
					
					$('#message').attr('disabled','true');
					users.setUsers([]); //empty userlist
					users.draw();
					$('#chattingHeader').css('display','none');
					$('#logDatePicker').css('display','none');
					$('#logsHeader').css('display','block');
					
					$('#logChanIndicator').text(channels.current().name);
					
					year = parseInt(d.getFullYear(),10);
					month = parseInt(d.getMonth()+1,10);
					day = parseInt(d.getDate(),10);
					updateInputVal();
					
					isOpen = true;
					fetch();
				},
				close = function(){
					var num;
					
					
					$('#chattingHeader').css('display','block');
					$('#logsHeader').css('display','none');
					isOpen = false;
					channels.current().reload();
				},
				fetchPart = function(n){
					network.getJSON('Log.php?day='+getLogUrlParam()+'&offset='+parseInt(n,10)+'&channel='+channels.current().handlerB64,function(data){
						if(!data.banned){
							if(data.lines.length>=1000){
								fetchPart(n+1000);
							}
							$.each(data.lines,function(i,line){
								parser.addLine(line,true);
							});
							scroll.up();
							if(data.lines.length<1000){
								indicator.stop();
							}
						}else{
							send.internal('<span style="color:#C73232;"><b>ERROR:</b> banned</banned>');
						}
					});
				},
				fetch = function(){
					indicator.start();
					
					$('#MessageBox').empty();
					
					fetchPart(0);
				},
				toggle = function(){
					if(isOpen){
						close();
					}else{
						open();
					}
				};
			return {
				init:function(){
					$('#logCloseButton')
						.click(function(e){
							e.preventDefault();
							close();
						});
					$('#logGoButton')
						.click(function(e){
							e.preventDefault();
							fetch();
						});
					$('#logsButton').click(function(e){
						e.preventDefault();
						toggle();
					});
					$('#logDate').click(function(e){
						e.preventDefault();
						$(this).focusout();
						if($('#logDatePicker').css('display')!='block'){
							displayDatePicker();
							e.stopPropagation();
						}
					});
					$(document).click(function(e){
						if(isOpen){
							var $cont = $('#logDatePicker');
							if(!$cont.is(e.target) && $cont.has(e.target).length === 0){
								$cont.css('display','none');
							}
						}
					});
				}
			};
		})();
		parser = (function(){
			var smileys = [],
				maxLines = 200,
				lastMessage = 0,
				ignores = [],
				cacheServerNicks = {},
				parseName = function(n,o,uid){
					if(uid === undefined){
						uid = -1;
					}
					n = (n=='\x00'?'':n); //fix 0-string bug
					var ne = encodeURIComponent(n);
					n = $('<span>').text(n).html();
					var rcolors = [19,20,22,24,25,26,27,28,29],
						sum = 0,
						i = 0,
						cn = n,
						net = settings.getNetwork(o),
						addLink = true;
					switch(options.get('colordNames')){
						case '1': // calc
							while(n[i]){
								sum += n.charCodeAt(i++);
							}
							cn = $('<span>').append($('<span>').addClass('uName-'+rcolors[sum %= 9].toString()).html(n)).html();
							break;
						case '2': //server
							if(net!==undefined && net.checkLogin!==undefined){
								addLink = false;
								if(cacheServerNicks[o.toString()+':'+uid.toString()]===undefined){
									network.getJSON(net.checkLogin+'?c='+uid.toString(10)+'&n='+ne,function(data){
										cacheServerNicks[o.toString()+':'+uid.toString()] = data.nick;
									},false,false);
								}
								cn = cacheServerNicks[o.toString()+':'+uid.toString()];
							}else{
								cn = n;
							}
							break;
						default: // none
							cn = n;
							break;
					}
					if(net!==undefined && addLink){
						cn = net.normal.split('NICKENCODE').join(ne).split('NICK').join(cn).split('USERID').join(uid.toString(10));
					}
					if(net!==undefined){
						return '<span title="'+net.name+'">'+cn+'</span>';
					}
					return '<span title="Unknown Network">'+cn+'</span>';
				},
				parseSmileys = function(s){
					var addStuff = '';
					if(!s){
						return '';
					}
					$.each(smileys,function(i,smiley){
						s = s.replace(RegExp(smiley.regex,'g'),smiley.replace.split('ADDSTUFF').join(addStuff).split('PIC').join(smiley.pic).split('ALT').join(smiley.alt));
					});
					return s;
				},
				parseLinks = function(text){
					if (!text || text === null || text === undefined){
						return '';
					}
					var a = ['ourl.ca','omnimaga.org','www.omnimaga.org'];
					var ier = "[^\\s\x01\x02\x03\x04\x0f\x16\x1d\x1f\"]"; // irc end regex
					text = text.replace(RegExp("(\x01|\x04)","g"),"");
					$.map(a,function(url){
						url = url.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
						text = text.replace(RegExp("(^|\\s)(((f|ht)(tp|tps):\/\/)"+url+ier+"*)","g"),'$1\x01$2')
									.replace(RegExp("(^|\\s)("+url+ier+"*)","g"),'$1\x04$2');
					});
					return text.replace(RegExp("(^|[^a-zA-Z0-9_\x01\x04]|\x03\\d{1,2}(|,\\d{1,2}))(((f|ht)(tp|tps):\/\/)"+ier+"+)","g"),'$1<a target="_blank" href="$3">$3</a>')
							.replace(RegExp("(^|[^a-zA-Z0-9_\x01\x04/])(www\\."+ier+"+)","g"),'$1<a target="_blank" href="http://$2">$2</a>')
							.replace(RegExp("(^|.)\x01("+ier+"+)","g"),'$1<a target="_top" href="$2">$2</a>')
							.replace(RegExp("(^|.)\x04("+ier+"+)","g"),'$1<a target="_top" href="http://$2">$2</a>');
				},
				parseColors = function(colorStr){
					var arrayResults = [],
						s,
						textDecoration = {
							fg:'-1',
							bg:'-1',
							underline:false,
							bold:false,
							italic:false
						},
						i,didChange;
					if(!colorStr){
						return '';
					}
					arrayResults = colorStr.split(RegExp('([\x02\x03\x0f\x16\x1d\x1f])'));
					colorStr='<span>';
					for(i=0;i<arrayResults.length;i++){
						didChange = true;
						switch(arrayResults[i]){
							case '\x03': // color
								s = arrayResults[i+1].replace(/^([0-9]{1,2}),([0-9]{1,2})(.*)/,'$1:$2');
								if(s == arrayResults[i+1]){ // we didn't change background
									s = arrayResults[i+1].replace(/^([0-9]{1,2}).*/,'$1:');
									if(s != arrayResults[i+1]){
										textDecoration.fg = s.split(':')[0];
										arrayResults[i+1] = arrayResults[i+1].substr(s.length-1); // -1 due to added colon
									}
								}else{ // we also changed background
									textDecoration.fg = s.split(':')[0];
									textDecoration.bg = s.split(':')[1];
									if(s == arrayResults[i+1]){
										arrayResults[i+1] = '';
									}else{
										arrayResults[i+1] = arrayResults[i+1].substr(s.length);
									}
								}
								break;
							case '\x02': // bold
								textDecoration.bold = !textDecoration.bold;
								break;
							case '\x1d': // italic
								textDecoration.italic = !textDecoration.italic;
								break;
							case '\x16': // swap fg and bg
								s = textDecoration.fg;
								textDecoration.fg = textDecoration.bg;
								textDecoration.bg = s;
								if(textDecoration.fg=='-1'){
									textDecoration.fg = '0';
								}
								if(textDecoration.bg=='-1'){
									textDecoration.bg = '1';
								}
								break;
							case '\x1f': // underline
								textDecoration.underline = !textDecoration.underline;
								break;
							case '\x0f': // reset
								textDecoration = {
									fg:'-1',
									bg:'-1',
									underline:false,
									bold:false,
									italic:false
								}
								break;
							default:
								didChange = false;
						}
						if(didChange){
							colorStr += '</span>'+
									'<span class="fg-'+textDecoration.fg+' bg-'+textDecoration.bg+'" style="'+(textDecoration.bold?'font-weight:bold;':'')+(textDecoration.underline?'text-decoration:underline;':'')+(textDecoration.italic?'font-style:italic;':'')+'">';
						}else{
							colorStr+=arrayResults[i];
						}
					}
					colorStr += '</span>';
					/*Strip codes*/
					colorStr = colorStr.replace(/(\x03|\x02|\x1F|\x09|\x0F)/g,'');
					return colorStr;
				},
				parseHighlight = function(s){
					if(s.toLowerCase().indexOf(settings.nick().toLowerCase().substr(0,options.get('charsHigh'))) >= 0 && settings.nick() != ''){
						var style = '';
						if(!options.get('highRed')){
							style += 'background:none;padding:none;border:none;';
						}
						if(options.get('highBold')){
							style += 'font-weight:bold;';
						}
						return '<span class="highlight" style="'+style+'">'+s+'</span>';
					}
					return s;
				},
				parseMessage = function(s,noSmileys){
					if(noSmileys==undefined || !noSmileys){
						noSmileys = false;
					}
					s = (s=="\x00"?'':s); //fix 0-string bug
					s = $('<span>').text(s).html();
					s = parseLinks(s);
					if(options.get('smileys') && noSmileys===false){
						s = parseSmileys(s);
					}
					s = parseColors(s);
					return s;
				},
				lineHigh = false;
			return {
				addLine:function(line,loadMode){
					if(loadMode===undefined){
						loadMode = false;
					}
					request.setCurLine(line.curLine);
					if(
						line.name === null || line.name === undefined || line.type === null || ignores.indexOf(line.name.toLowerCase()) > -1
						|| (
							line.chan.toString().toLowerCase()!=channels.current().handler.toLowerCase()
							&& ('*'+line.chan).toLowerCase()!=channels.current().handler.toLowerCase()
							&& line.chan.toString()[0]!='*' && line.chan.toString().toLowerCase()!=settings.nick().toLowerCase()
							&& line.type != 'highlight'
						)
						){
						return true; // invalid line but we don't want to stop the new requests
					}
					var $mBox = $('#MessageBox'),
						name = parseName(line.name,line.network,line.uid),
						message = parseMessage(line.message),
						tdName = '*',
						tdMessage = message,
						addLine = true,
						statusTxt = '';
					if(line.network == -1){
						addLine = false;
					}
					if((['message','action','pm','pmaction'].indexOf(line.type)>=0) && line.name.toLowerCase() != '*'){
						tdMessage = message = parseHighlight(message,line);
						if(page.isBlurred()){
							notification.make('('+channels.current().name+') <'+line.name+'> '+line.message,line.chan);
						}
					}
					switch(line.type){
						case 'reload':
							addLine = false;
							if(!loadMode){
								channels.current().reload();
								return false;
							}
							break;
						case 'reload_userlist':
							addLine = false;
							if(!loadMode){
								channels.current().reloadUserlist();
								return true;
							}
						case 'relog':
							addLine = false;
							if(!loadMode){
								settings.fetch(undefined,true);
							}
							break;
						case 'refresh':
							addLine = false;
							if(!loadMode){
								location.reload(true);
							}
							break;
						case 'join':
							tdMessage = [name,' has joined '+channels.current().name];
							if(!loadMode){
								users.add({
									nick:line.name,
									network:line.network
								});
							}
							if(addLine && settings.getNetwork(line.network).type==1 && options.get('oircJoinPart')){
								addLine = false;
							}
							break;
						case 'part':
							tdMessage = [name,' has left '+channels.current().name+' (',message,')'];
							if(!loadMode){
								users.remove({
									nick:line.name,
									network:line.network
								});
							}
							if(addLine && settings.getNetwork(line.network).type==1 && options.get('oircJoinPart')){
								addLine = false;
							}
							break;
						case 'quit':
							tdMessage = [name,' has quit IRC (',message,')'];
							if(!loadMode){
								users.remove({
									nick:line.name,
									network:line.network
								});
							}
							if(addLine && settings.getNetwork(line.network).type==1 && options.get('oircJoinPart')){
								addLine = false;
							}
							break;
						case 'kick':
							tdMessage = [name,' has kicked ',parseName(line.name2,line.network),' from '+channels.current().name+' (',message,')'];
							if(!loadMode){
								users.remove({
									nick:line.name2,
									network:line.network
								});
							}
							break;
						case 'message':
							tdName = name;
							break;
						case 'action':
							tdMessage = [name,' ',message];
							break;
						case 'mode':
							if(typeof(message)=='string'){
								message = line.message.split(' ');
								$.each(message,function(i,v){
									var n = $('<span>').html(v).text();
									if(n.indexOf('+')==-1 && n.indexOf('-')==-1){
										message[i] = parseName(v,line.network);
									}
								});
								message = message.join(' ');
							}
							tdMessage = [name,' set '+channels.current().name+' mode ',message];
							break;
						case 'nick':
							tdMessage = [name,' has changed nicks to ',parseName(line.name2,line.network)];
							if(!loadMode){
								users.add({
									nick:line.name2,
									network:line.network
								});
								users.remove({
									nick:line.name,
									network:line.network
								});
							}
							break;
						case 'topic':
							topic.set(parseMessage(line.message,true));
							tdMessage = [name,' has changed the topic to ',parseMessage(line.message,true)];
							break;
						case 'pm':
							if(channels.current().name == '*'+line.name.toLowerCase() || channels.current().name == '*'+line.chan.toLowerCase()){
								tdName = name;
								line.type = 'message';
							}else{
								if(!loadMode){
									if(line.name.toLowerCase() == settings.nick().toLowerCase()){
										addLine = false;
										channels.openPm(line.chan);
									}else{
										tdName = ['(PM)',name];
										channels.openPm(line.name);
										notification.make('(PM) <'+line.name+'> '+line.message,line.chan);
									}
								}else{
									addLine = false;
								}
							}
							break;
						case 'pmaction':
							if(channels.current().name == '*'+line.name.toLowerCase() || channels.current().name == '*'+line.chan.toLowerCase()){
								tdMessage = [name,' ',message];
								line.type = 'action';
							}else{
								if(!loadMode){
									if(line.name.toLowerCase() == settings.nick().toLowerCase()){
										addLine = false;
										channels.openPm(line.chan);
									}else{
										tdMessage = ['(PM)',name,' ',message];
										channels.openPm(line.name);
										notification.make('* (PM)'+line.name+' '+line.message,line.chan);
										line.type = 'pm';
									}
								}else{
									addLine = false;
								}
							}
							break;
						case 'highlight':
							if(line.name.toLowerCase() != '*'){
								notification.make('('+line.chan+') <'+line.name+'> '+line.message,line.chan);
							}
							addLine = false;
							break;
						case 'internal':
							tdMessage = line.message;
							break;
						case 'server':
							break;
						default:
							addLine = false;
					}
					if(addLine){
						if(($mBox.find('tr').length>maxLines) && logMode!==true){
							$mBox.find('tr:first').remove();
						}
						
						
						if(tdName == '*'){
							statusTxt = '* ';
						}else{
							statusTxt = '<'+line.name+'> ';
						}
						if(options.get('times')){
							statusTxt = '['+(new Date(line.time*1000)).toLocaleTimeString()+'] '+statusTxt;
						}
						statusTxt += $('<span>').append(tdMessage).text();
						statusBar.set(statusTxt);
						
						var $tr = $('<tr>')
							.addClass((options.get('altLines') && (lineHigh = !lineHigh)?'lineHigh':''))
							.addClass(((new Date(lastMessage)).getDay()!=(new Date(line.time*1000)).getDay())?'seperator':'') //new day indicator
							.append(
								(options.get('times')?$('<td>')
									.addClass('irc-date')
									.append('['+(new Date(line.time*1000)).toLocaleTimeString()+']'):''),
								$('<td>')
									.addClass('name')
									.append(tdName),
								$('<td>')
									.addClass(line.type)
									.append(tdMessage)
							);
						$tr.find('img').load(function(e){
							scroll.slide();
						});
						$mBox.append($tr);
						scroll.slide();
						
						lastMessage = line.time*1000;
					}
					return true;
				},
				setSmileys:function(s){
					smileys = s;
				},
				getSmileys:function(){
					return smileys;
				},
				setIgnoreList:function(a){
					ignores = a;
				},
				parseTextDecorations:function(s){
					if(s !== '' && options.get('textDeco')){
						if(s[0] == '>'){
							s = '\x033'+s;
						}
						s = s.replace(/((^|\s)\*[^\*]+\*($|\s))/g,'\x02$1\x02')
								.replace(/((^|\s)\/[^\/]+\/($|\s))/g,'\x1d$1\x1d')
								.replace(/((^|\s)_[^_]+_($|\s))/g,'\x1f$1\x1f');
					}
					return s;
				}
			};
		})();
	$(function(){
		network.init();
		switch($('body').attr('page')){
			case 'options':
				settings.fetch(function(){
					page.changeLinks();
					$('#options').height($(window).height() - 75);
					$(window).resize(function(){
						if(!(navigator.userAgent.match(/(iPod|iPhone|iPad)/i) && navigator.userAgent.match(/AppleWebKit/i))){
							$('#options').height($(window).height() - 75);
						}
					});
					$('body').css('font-size',options.get('fontSize').toString(10)+'pt');
					$('#options').append(options.getHTML());
				});
				break;
			case 'admin':
				$.getScript('admin.js');
				break;
			//case 'main': // no need, already caught by default.
			default:
				page.load();
		}
	});
	return {
		OMNOMIRCSERVER:OMNOMIRCSERVER,
		page:{
			changeLinks:function(){
				page.changeLinks();
			}
		},
		settings:{
			fetch:function(fn){
				settings.fetch(fn);
			}
		},
		indicator:{
			start:indicator.start,
			stop:indicator.stop
		},
		network:{
			getJSON:function(s,fn,async,urlparams){
				network.getJSON(s,fn,async,urlparams);
			},
			post:function(s,data,fn,async,urlparams){
				network.post(s,data,fn,async,urlparams);
			}
		},
		options:{
			getFullOptionsString:function(){
				return options.getFullOptionsString();
			}
		}
	}
})();