#!/usr/bin/python3
## -*- coding: utf-8 -*-


#	OmnomIRC COPYRIGHT 2010,2011 Netham45
#					   2012-2015 Sorunome
#
#	This file is part of OmnomIRC.
#
#	OmnomIRC is free software: you can redistribute it and/or modify
#	it under the terms of the GNU General Public License as published by
#	the Free Software Foundation, either version 3 of the License, or
#	(at your option) any later version.
#
#	OmnomIRC is distributed in the hope that it will be useful,
#	but WITHOUT ANY WARRANTY; without even the implied warranty of
#	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#	GNU General Public License for more details.
#
#	You should have received a copy of the GNU General Public License
#	along with OmnomIRC.  If not, see <http://www.gnu.org/licenses/>.
import threading,socket,string,time,sys,json,pymysql,traceback,errno,chardet,struct,signal,subprocess,select,re
from base64 import b64encode
from hashlib import sha1

print('Starting OmnomIRC bot...')
DOCUMENTROOT = '/usr/share/nginx/html/oirc'



def b64encode_wrap(s):
	return makeUnicode(b64encode(bytes(s,'utf-8')))

def makeUnicode(s):
	try:
			return s.decode('utf-8')
	except:
		if s!='':
			try:
				return s.decode(chardet.detect(s)['encoding'])
			except:
				return s
		return ''


def execPhp(f,d):
	s = []
	for key,value in d.items():
		s.append(str(key)+'='+str(value))
	res = subprocess.Popen(['php',DOCUMENTROOT+'/'+f] + s,stdout=subprocess.PIPE).communicate()
	try:
		return json.loads(makeUnicode(res[0]))
	except:
		try:
			return makeUnicode(res[0])
		except:
			try:
				return res[0]
			except:
				return res

#config handler
class Config:
	def __init__(self):
		self.readFile()
	def readFile(self):
		jsons = ''
		searchingJson = True
		f = open(DOCUMENTROOT+'/config.json.php')
		lines = f.readlines()
		f.close()
		for l in lines:
			if searchingJson:
				if l.strip()=='?>':
					searchingJson = False
			else:
				jsons += l + "\n"
		self.json = json.loads(jsons[:-1])

#sql handler
class Sql:
	def __init__(self):
		global config
	def fetchOneAssoc(self,cur):
		data = cur.fetchone()
		if data == None:
			return None
		desc = cur.description
		ret = {}
		for (name,value) in zip(desc,data):
			ret[name[0]] = value
		print(ret)
		return ret
	def query(self,q,p = []):
		global config
		try:
			db = pymysql.connect(
				host=config.json['sql']['server'],
				user=config.json['sql']['user'],
				password=config.json['sql']['passwd'],
				db=config.json['sql']['db'],
				charset='utf8',
				cursorclass=pymysql.cursors.DictCursor)
			cur = db.cursor()
			
			cur.execute(q,tuple(p))
			db.commit()
			rows = []
			for row in cur:
				if row == None:
					break
				rows.append(row)
			cur.close()
			db.close()
			return rows
		except Exception as inst:
			print('(sql) Error')
			print(inst)
			traceback.print_exc()
			return False

class ServerHandler:
	def __init__(self,s,address):
		self.socket = s
		self.client_address = address
	def setup(self):
		return True
	def recieve(self):
		data = self.socket.recv(1024)
		return True
	def close(self):
		try:
			self.socket.close()
		except:
			pass
	def isHandler(self,s):
		return s == self.socket
	def getSocket(self):
		return self.socket

class Server(threading.Thread):
	host = ''
	port = 0
	backlog = 5
	stopnow = False
	def __init__(self,host,port,handler):
		threading.Thread.__init__(self)
		self.host = host
		self.port = port
		self.handler = handler
	def getHandler(self,client,address):
		return self.handler(client,address)
	def getInputHandler(self,s):
		for i in self.inputHandlers:
			if i.isHandler(s):
				return i
		return False
	def getSocket(self):
		return socket.socket(socket.AF_INET,socket.SOCK_STREAM)
	def run(self):
		server = self.getSocket()
		server.bind((self.host,self.port))
		server.listen(self.backlog)
		server.settimeout(5)
		input = [server]
		self.inputHandlers = []
		while not self.stopnow:
			inputready,outputready,exceptready = select.select(input,[],[],5)
			for s in inputready:
				if s == server:
					# handle incoming socket connections
					client, address = server.accept()
					client.settimeout(0.1)
					handler = self.getHandler(client,address)
					if handler.setup():
						self.inputHandlers.append(handler)
						input.append(client)
					else:
						handler.close()
				else:
					# handle other socket connections
					i = self.getInputHandler(s)
					if i:
						try:
							if not i.recieve():
								try:
									i.close()
								except:
									pass
								try:
									s.close()
								except:
									pass
								input.remove(s)
								self.inputHandlers.remove(i)
						except socket.timeout:
							pass
						except Exception as err:
							print(err)
							traceback.print_exc()
							try:
								i.close()
							except:
								pass
							try:
								s.close()
							except:
								pass
							input.remove(s)
							self.inputHandlers.remove(i)
							break
					else:
						s.close()
						input.remove(s)
		for s in input:
			try:
				s.close()
			except:
				pass
		for i in self.inputHandlers:
			try:
				i.close()
			except:
				pass
	def stop(self):
		self.stopnow = True

class SSLServer(Server):
	def getSocket(self):
		dir = os.path.dirname(__file__)
		key_file = os.path.join(dir,'server.key')
		cert_file = os.path.join(dir,'server.crt')
		import ssl
		s = socket.socket(socket.AF_INET,socket.SOCK_STREAM)
		return ssl.wrap_socket(s, keyfile=key_file, certfile=cert_file, cert_reqs=ssl.CERT_NONE)

class OircRelay:
	relayType = -1
	id = -1
	def __init__(self,n):
		self.id = int(n['id'])
		self.config = n['config']
		self.initRelay()
	def initRelay(self):
		return
	def startRelay_wrap(self):
		sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE online = %s",[self.id])
		self.startRelay()
	def startRelay(self):
		return
	def updateRelay_wrap(self,cfg):
		if self.id == int(cfg['id']):
			self.updateRelay(cfg['config'])
	def updateRelay(self,cfg):
		self.stopRelay_wrap()
		self.config = cfg
		self.startRelay_wrap()
	def stopRelay_wrap(self):
		sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE online = %s",[self.id])
		self.stopRelay()
	def stopRelay(self):
		return
	def relayMessage(self,n1,n2,t,m,c,s,uid):
		return
	def relayTopic(self,s,c,i):
		return


#irc bot
class Bot(threading.Thread):
	def __init__(self,server,port,nick,ns,main,i,tbe,mn,tn,dssl):
		threading.Thread.__init__(self)
		self.stopnow = False
		self.restart = False
		self.topicbotExists = tbe
		self.server = server
		self.port = port
		self.nick = nick
		self.nick_want = nick
		self.ns = ns
		self.main = main
		self.i = i
		self.userlist = {}
		self.chans = {}
		self.mainNick = mn
		self.topicNick = tn
		self.ssl = dssl
		
		self.lastTriedNick = time.time()
		for ch in config.json['channels']:
			if ch['enabled']:
				for c in ch['networks']:
					if c['id'] == i:
						self.chans[ch['id']] = c['name']
						break
		if self.main:
			self.recieveStr = '>>'
			self.sendStr = '<<'
		else:
			self.recieveStr = 'T>'
			self.sendStr = 'T<'
	def updateConfig(self,nick,ns,tbe,mn,tn):
		self.topicbotExists = tbe
		self.mainNick = mn
		self.topicNick = tn
		
		if self.ns != ns:
			self.ns = ns
			if ns == '':
				self.send('PRIVMSG NickServ :LOGOUT',True)
			else:
				self.send('PRIVMSG NickServ :IDENTIFY %s' % (ns),True)
		
		if self.nick != nick:
			self.nick = nick
			self.nick_want = nick
			self.send('NICK %s' % (nick),True)
		
		self.updateChans()
	def updateChans(self):
		updateChans = {}
		for ch in config.json['channels']:
			if ch['enabled']:
				for c in ch['networks']:
					if c['id'] == self.i and not (ch['id'] in self.chans):
						updateChans[ch['id']] = c['name']
		removeChans = []
		for i,n in self.chans.items():
			found = False
			for ch in config.json['channels']:
				if not ch['enabled'] and i in self.chans:
					break
				if ch['enabled']:
					for c in ch['networks']:
						if ch['id'] == i and c['id'] == self.i:
							found = True
			if not found:
				removeChans.append(i)
		for ch in removeChans:
			c = self.idToChan(ch)
			self.send('PART %s' % c,True)
			self.userlist.pop(c,False)
			self.addLine('OmnomIRC','','reload_userlist','THE GAME',c,True)
			self.chans.pop(ch)
		for i,c in updateChans.items():
			self.chans[i] = c
			self.send('JOIN %s' % c,True)
	def idToChan(self,i):
		if i in self.chans:
			return self.chans[i]
		try:
			if int(i) in self.chans:
				return self.chans[int(i)]
		except:
			return -1
		return -1
	def chanToId(self,c):
		for i,ch in self.chans.items():
			if c.lower() == ch.lower():
				return i
		return -1
	def stopThread(self):
		if self.main:
			add = ')'
		else:
			add = 'T)'
		print('Giving signal to quit irc bot... ('+str(self.i)+add)
		self.quitMsg = 'Got signal to quit'
		#try:
		#	self.s.close()
		#except:
		#	traceback.print_exc()
		self.stopnow = True
	def sendTopic(self,s,c):
		c = self.idToChan(c)
		if c != -1 and (self.topicbotExists ^ self.main):
			self.s.sendall(bytes('TOPIC %s :%s\r\n' % (c,s),'utf-8'))
			print('('+str(self.i)+')'+self.sendStr+' '+c+' '+s)
	def send(self,s,override = False,overrideRestart = False):
		try:
			if self.main or override:
				try:
					self.s.sendall(bytes('%s\r\n' % s,'utf-8'))
					print('('+str(self.i)+')'+self.sendStr+' '+s)
				except:
					self.s.sendall(bytes('%s\r\n' % s.encode('utf-8'),'utf-8'))
					print('('+str(self.i)+')'+self.sendStr+' '+s.encode('utf-8'))
		except:
			traceback.print_exc()
			if not self.stopnow and not overrideRestart:
				self.restart = True
				self.stopThread()
	def connectToIRC(self):
		self.s = socket.socket()
		self.s.settimeout(5)
		if self.ssl:
			import ssl
			self.s = ssl.wrap_socket(self.s)
		self.s.connect((self.server,self.port))
		self.send('USER %s %s %s :%s' % ('OmnomIRC','host','server',self.nick),True)
		self.send('NICK %s' % (self.nick),True)
	def sendLine(self,n1,n2,t,m,c,s): #name 1, name 2, type, message, channel, source
		global config
		c = self.idToChan(c)
		if c != -1:
			colorAdding = ''
			for n in config.json['networks']:
				if n['id'] == s:
					if n['irc']['color']==-2:
						colorAdding = '\x02'+n['irc']['prefix']+'\x02'
					elif n['irc']['color']==-1:
						colorAdding = n['irc']['prefix']
					else:
						colorAdding = '\x03'+str(n['irc']['color'])+n['irc']['prefix']+'\x0F'
					break
			if colorAdding!='':
				if t=='message':
					self.send('PRIVMSG %s :%s<%s> %s' % (c,colorAdding,n1,m))
				elif t=='action':
					self.send('PRIVMSG %s :%s\x036* %s %s' % (c,colorAdding,n1,m))
				elif t=='join':
					self.send('PRIVMSG %s :%s\x033* %s has joined %s' % (c,colorAdding,n1,c))
				elif t=='part':
					self.send('PRIVMSG %s :%s\x032* %s has left %s (%s)' % (c,colorAdding,n1,c,m))
				elif t=='quit':
					self.send('PRIVMSG %s :%s\x032* %s has quit %s (%s)' % (c,colorAdding,n1,c,m))
				elif t=='mode':
					self.send('PRIVMSG %s :%s\x033* %s set %s mode %s' % (c,colorAdding,n1,c,m))
				elif t=='kick':
					self.send('PRIVMSG %s :%s\x034* %s has kicked %s from %s (%s)' % (c,colorAdding,n1,n2,c,m))
				elif t=='topic':
					self.send('PRIVMSG %s :%s\x033* %s has changed the topic to %s' % (c,colorAdding,n1,m))
				elif t=='nick':
					self.send('PRIVMSG %s :%s\x033* %s has changed nicks to %s' % (c,colorAdding,n1,n2))
	def addLine(self,n1,n2,t,m,c,sendToOther):
		global sql,handle
		c = self.chanToId(c)
		if c != -1:
			if sendToOther:
				handle.sendToOther(n1,n2,t,m,c,self.i)
			c = makeUnicode(str(c))
			print('(1)<< '+str({'name1':n1,'name2':n2,'type':t,'message':m,'channel':c}))
			sql.query("INSERT INTO `irc_lines` (`name1`,`name2`,`message`,`type`,`channel`,`time`,`online`) VALUES (%s,%s,%s,%s,%s,%s,%s)",[n1,n2,m,t,c,str(int(time.time())),int(self.i)])
			if t=='topic':
				temp = sql.query("SELECT channum FROM `irc_channels` WHERE chan=%s",[c.lower()])
				if len(temp)==0:
					sql.query("INSERT INTO `irc_channels` (chan,topic) VALUES(%s,%s)",[c.lower(),m])
				else:
					sql.query("UPDATE `irc_channels` SET topic=%s WHERE chan=%s",[m,c.lower()])
			if t=='action' or t=='message':
				sql.query("UPDATE `irc_users` SET lastMsg=%s WHERE username=%s AND channel=%s AND online=%s",[str(int(time.time())),n1,c,int(self.i)])
			handle.updateCurline()
	def addUser(self,u,c):
		c = self.chanToId(c)
		if c != -1:
			if c in self.userlist:
				self.userlist[c].append(u)
			else:
				self.userlist[c] = [u]
			handle.addUser(u,c,self.i)
	def removeUser(self,u,c):
		global sql
		c = self.chanToId(c)
		if c != -1:
			if c in self.userlist:
				self.userlist[c].remove(u)
			handle.removeUser(u,c,self.i)
	def handleQuit(self,n,m):
		global handle
		for c,us in self.userlist.items():
			removedUsers = []
			for u in us:
				if u==n:
					c = self.idToChan(c) # userlist array uses ids
					if c != -1:
						self.removeUser(n,c)
						if not n in removedUsers:
							self.addLine(n,'','quit',m,c,True)
							removedUsers.append(n);
	def handleNickChange(self,old,new):
		global handle
		for c,us in self.userlist.items():
			changedNicks = []
			for u in us:
				if u==old:
					c = self.idToChan(c) # userlist array uses ids
					if c != -1:
						self.removeUser(old,c)
						self.addUser(new,c)
						if not new in changedNicks:
							self.addLine(old,new,'nick','',c,True)
							changedNicks.append(new)
		return False
	def doMain(self,line):
		global handle,config
		
		for i in range(len(line)):
			line[i] = makeUnicode(line[i])
			
		message = ' '.join(line[3:])[1:]
		
		nick = line[0].split('!')[0][1:]
		chan = line[2]
		if chan[0]!='#':
			chan = chan[1:]
		if line[1]=='PRIVMSG':
			if line[2][0]!='#' and line[3] == ':DOTHIS' and line[4] == config.json['security']['ircPwd']:
				self.send(' '.join(line[5:]))
			elif line[2][0]=='#':
				if line[3]==':\x01ACTION' and message[-1:]=='\x01':
					self.addLine(nick,'','action',message[8:-1],chan,True)
				else:
					self.addLine(nick,'','message',message,chan,True)
		elif line[1]=='JOIN':
			self.addLine(nick,'','join','',chan,True)
			self.addUser(nick,chan)
			if nick.lower()==self.nick.lower():
				self.getUsersInChan(chan)
		elif line[1]=='PART':
			self.addLine(nick,'','part',message,chan,True)
			self.removeUser(nick,chan)
			if nick.lower()==self.nick.lower():
				self.delUsersInChan(chan)
		elif line[1]=='QUIT':
			self.handleQuit(nick,' '.join(line[2:])[1:])
		elif line[1]=='MODE':
			self.addLine(nick,'','mode',' '.join(line[3:]),chan,True)
		elif line[1]=='KICK':
			self.addLine(nick,line[3],'kick',' '.join(line[4:])[1:],chan,True)
			self.removeUser(line[3],chan)
		elif line[1]=='TOPIC':
			if nick.lower()!=self.mainNick.lower() and nick.lower()!=self.topicNick.lower():
				self.addLine(nick,'','topic',message,chan,True)
				handle.sendTopicToOther(message,self.chanToId(chan),self.i)
		elif line[1]=='NICK':
			self.handleNickChange(nick,line[2][1:])
		elif line[1]=='352':
			self.addUser(line[7],line[3])
		elif line[1]=='315':
			self.addLine('OmnomIRC','','reload_userlist','THE GAME',line[3],True)
	def handleNickTaken(self,line):
		for i in range(len(line)):
			line[i] = makeUnicode(line[i])
		if line[1]=='433':
			self.nick += '_'
			self.send('NICK %s' % (self.nick),True)
		if self.nick != self.nick_want and self.lastTriedNick + 90 <= time.time(): # only try every now and then
			self.nick = self.nick_want
			self.send('NICK %s' % (self.nick),True)
	def ircloop(self,fn):
		global sql
		if self.main:
			add = ')'
		else:
			add = 'T)'
		self.quitLoop = False
		while not self.stopnow and not self.quitLoop:
			try:
				self.readbuffer += makeUnicode(self.s.recv(1024))
			except socket.error as e:
				if isinstance(e.args,tuple):
					if e == errno.EPIPE:
						self.stopnow = True
						self.restart = True
						self.quitMsg = 'Being stupid'
						print('Restarting due to stupidness ('+str(self.i)+add)
					elif e == errno.ECONNRESET:
						self.stopnow = True
						self.restart = True
						self.quitMsg = 'Being very stupid'
						print('Restarting because connection being reset by peer')
				time.sleep(0.1)
				if self.lastPingTime+30 <= time.time():
					self.send('PING %s' % time.time(),True)
					self.lastPingTime = time.time()
				if self.lastLineTime+90 <= time.time(): # allow up to 60 seconds lag
					self.stopnow = True
					self.restart = True
					self.lastLineTime = time.time()
					self.quitMsg = 'No pings (1)'
					print('Restarting due to no pings ('+str(self.i)+add)
			except Exception as inst:
				print(inst)
				traceback.print_exc()
				time.sleep(0.1)
				if self.lastLineTime+90 <= time.time(): # allow up to 60 seconds lag
					self.stopnow = True
					self.restart = True
					self.lastLineTime = time.time()
					self.quitMsg = 'No pings (2)'
					print('Restarting due to no pings ('+str(self.i)+add)
			temp=self.readbuffer.split('\n')
			self.readbuffer = temp.pop()
			if self.lastPingTime+90 <= time.time(): # allow up to 60 seconds lag
				self.stopnow = True
				self.restart = True
				self.lastLineTime = time.time()
				self.quitMsg = 'No pings(3)'
				continue
			if self.lastPingTime+30 <= time.time():
				self.send('PING %s' % time.time(),True)
				self.lastPingTime = time.time()
			for line in temp:
				print('('+str(self.i)+')'+self.recieveStr+' '+line)
				line=line.rstrip()
				line=line.split()
				try:
					self.lastLineTime = time.time()
					if(line[0]=='PING'):
						self.send('PONG %s' % line[1],True)
						continue
					if line[0]=='ERROR' and 'Closing Link' in line[1]:
						time.sleep(30)
						self.stopnow = True
						self.restart = True
						self.quitMsg = 'Closed link'
						print('Error when connecting, restarting bot ('+str(self.i)+add)
						break
					fn(line)
					self.handleNickTaken(line)
				except Exception as inst:
					print('('+str(self.i)+') parse Error')
					print(inst)
					traceback.print_exc()
		if self.stopnow:
			if self.quitMsg!='':
				self.send('QUIT :%s' % self.quitMsg,True,False)
				self.handleQuit(self.nick,self.quitMsg)
			if self.main:
				sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE online = %s",[int(self.i)])
				handle.updateCurline() # others do this automatically
			try:
				time.sleep(1) # give the server one second time to close the connection on us
				self.s.close()
			except:
				pass
	def serveFn(self,line):
		if self.main:
			self.doMain(line)
	def delUsersInChan(self,c):
		c = self.chanToId(c)
		if c != -1:
			sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE `online` = %s AND `channel` = %s",[int(self.i),c])
	def getUsersInChan(self,c):
		self.delUsersInChan(c)
		self.send('WHO %s' % c)
	def joinChans(self):
		#ca = []
		for i,c in self.chans.items():
			self.send('JOIN %s' % c,True)
			#ca.append(c)
		#self.send('JOIN %s' % (','.join(ca)),True)
	def identServerFn(self,line):
		if line[1]=='376' or line[1]=='422':
			self.motdEnd = True
		if not self.identified and ((line[1] == 'NOTICE' and 'NickServ' in line[0])):
			if self.identifiedStep==0:
				self.send('PRIVMSG NickServ :IDENTIFY %s' % self.ns,True)
				self.identifiedStep = 1
			elif self.identifiedStep==1:
				self.identified = True
		if self.motdEnd and self.identified:
			self.quitLoop = True
	def run(self):
		global sql
		self.restart = True
		while self.restart:
			self.restart = False
			self.stopnow = False
			self.identified = False
			self.motdEnd = False
			self.identifiedStep = 0
			self.quitMsg = ''
			self.lastPingTime = time.time()
			self.lastLineTime = time.time()
			if self.main:
				add = ')'
			else:
				add = 'T)'
			print('Starting bot... ('+str(self.i)+add)
			if self.main:
				sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE online = %s",[int(self.i)])
			self.connectToIRC()
			self.readbuffer = ''
			
			if self.ns=='':
				self.identified = True
			self.ircloop(self.identServerFn)
			
			if not self.stopnow:
				print('Starting main loop... ('+str(self.i)+add)
				self.joinChans()
				self.ircloop(self.serveFn)
			if self.restart:
				print('Restarting bot ('+str(self.i)+add)
				time.sleep(15)
		print('Good bye from bot ('+str(self.i)+add)

class RelayIRC(OircRelay):
	relayType = 3
	bot = False
	topicBot = False
	def newBot(self,t,cfg):
		return Bot(cfg[t]['server'],cfg[t]['port'],cfg[t]['nick'],cfg[t]['nickserv'],t=='main',self.id,self.haveTopicBot,
						cfg['main']['nick'],cfg['topic']['nick'],cfg[t]['ssl'])
	def initRelay(self):
		self.haveTopicBot = self.config['topic']['nick'] != ''
		self.bot = self.newBot('main',self.config)
		if self.haveTopicBot:
			self.topicBot = self.newBot('topic',self.config)
	def startRelay(self):
		self.bot.start()
		if self.haveTopicBot:
			self.topicBot.start()
	def updateRelay(self,cfg):
		haveTopicBot = cfg['topic']['nick'] != ''
		haveTopicBot_old = self.haveTopicBot
		self.haveTopicBot = haveTopicBot
		for bot_ref,t in [['bot','main'],['topicBot','topic']]:
			bot = getattr(self,bot_ref)
			if bot:
				if bot.ssl != cfg[t]['ssl'] or bot.server != cfg[t]['server'] or bot.port != cfg[t]['port']:
					bot.stopThread()
					setattr(self,bot_ref,self.newBot(t,cfg))
					getattr(self,bot_ref).start()
					continue
				bot.updateConfig(cfg[t]['nick'],cfg[t]['nickserv'],self.haveTopicBot,cfg['main']['nick'],cfg['topic']['nick'])
		if haveTopicBot_old != haveTopicBot:
			self.bot.topicbotExists = self.haveTopicBot
			if self.haveTopicBot: # we need to generate a new bot!
				self.topicBot = self.newBot('topic',cfg)
				self.topicBot.start()
			else: # we need to remove a bot!
				self.topicBot.stopThread()
				self.topicBot = False
		self.config = cfg
	def stopRelay(self):
		self.bot.stopThread()
		if self.haveTopicBot:
			self.topicBot.stopThread()
	def relayMessage(self,n1,n2,t,m,c,s,uid):
		try:
			if s != self.id:
				self.bot.sendLine(n1,n2,t,m,c,s)
		except Exception as inst:
			print(inst)
			traceback.print_exc()
	def relayTopic(self,s,c,i):
		if i != self.id:
			if self.haveTopicBot:
				self.topicBot.sendTopic(s,c)
			else:
				self.bot.sendTopic(s,c)


# websockethandler skeleton from https://gist.github.com/jkp/3136208
class WebSocketsHandler(ServerHandler):
	magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
	sig = ''
	network = -1
	uid = -1
	nick = ''
	identified = False
	globalop = False
	banned = True
	chan = ''
	msgStack = []
	def setup(self):
		print("connection established"+str(self.client_address))
		self.handshake_done = False
		print('New Web-Client\n')
		return True
	def recieve(self):
		if not self.handshake_done:
			return self.handshake()
		else:
			return self.read_next_message()
	def read_next_message(self):
		b1,b2 = self.socket.recv(2)
		if not b1 & 0x80:
			print('Client closed connection')
			return False
		if b1 & 0x0F == 0x8:
			print('Client asked to close connection')
			return False
		if not b1 & 0x80:
			print('Client must always be masked')
			return False
		length = b2 & 127
		if length == 126:
			length = struct.unpack(">H", self.socket.recv(2))[0]
		elif length == 127:
			length = struct.unpack(">Q", self.socket.recv(8))[0]
		masks = self.socket.recv(4)
		decoded = ""
		for char in self.socket.recv(length):
			decoded += chr(char ^ masks[len(decoded) % 4])
		try:
			return self.on_message(json.loads(makeUnicode(decoded)))
		except Exception as inst:
			traceback.print_exc()
			return True
	def send_message(self, message):
		try:
			header = bytearray()
			message = makeUnicode(message)
			
			length = len(message)
			self.socket.send(bytes([129]))
			if length <= 125:
				self.socket.send(bytes([length]))
			elif length >= 126 and length <= 65535:
				self.socket.send(bytes([126]))
				self.socket.send(struct.pack(">H",length))
			else:
				self.socket.send(bytes([127]))
				self.socket.send(struct.pack(">Q",length))
			self.socket.send(bytes(message,'utf-8'))
		except IOError as e:
			traceback.print_exc()
			if e.errno == errno.EPIPE:
				return self.close()
		return True
	def addLine(self,t,m):
		global handle,sql
		c = self.chan
		if isinstance(c,str) and len(c) > 0 and c[0]=='*':
			c = c[1:]
			if t=='message':
				t = 'pm'
			elif t=='action':
				t = 'pmaction'
			else:
				return
		if c!='':
			print('('+str(self.network)+')>> '+str({'chan':c,'nick':self.nick,'message':m,'type':t}))
			handle.sendToOther(self.nick,'',t,m,c,self.network,self.uid)
			sql.query("INSERT INTO `irc_lines` (`name1`,`name2`,`message`,`type`,`channel`,`time`,`online`,`uid`) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",[self.nick,'',m,t,c,str(int(time.time())),int(self.network),self.uid])
			sql.query("UPDATE `irc_users` SET lastMsg=%s WHERE username=%s AND channel=%s AND online=%s",[str(int(time.time())),self.nick,str(self.chan),int(self.network)])
			handle.updateCurline()
	def join(self): # updates nick in userlist
		global sql
		if isinstance(self.chan,str) and len(self.chan) > 0 and self.chan[0]=='*': # no userlist on PMs
			return
		res = sql.query("SELECT usernum,time,isOnline FROM `irc_users` WHERE `username` = %s AND `channel` = %s AND `online` = %s",[self.nick,str(self.chan),self.network])
		if len(res)>0: # Update
			sql.query("UPDATE `irc_users` SET `time`=0,`isOnline`=1 WHERE `usernum` = %s",[int(res[0]['usernum'])])
			if int(res[0]['isOnline'] == 0):
				sql.query("INSERT INTO `irc_lines` (name1,type,channel,time,online) VALUES(%s,'join',%s,%s,%s)",[self.nick,str(self.chan),str(int(time.time())),int(self.network)])
		else:
			sql.query("INSERT INTO `irc_users` (`username`,`channel`,`time`,`online`) VALUES(%s,%s,0,%s)",[self.nick,str(self.chan),self.network])
			sql.query("INSERT INTO `irc_lines` (name1,type,channel,time,online,uid) VALUES(%s,'join',%s,%s,%s,%s)",[self.nick,str(self.chan),str(int(time.time())),int(self.network),self.uid])
	def part(self):
		if self.chan!='':
			sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE `username` = %s AND `channel` = %s AND `online` = %s",[self.nick,str(self.chan),self.network]);
			sql.query("INSERT INTO `irc_lines` (name1,type,channel,time,online,uid) VALUES(%s,'part',%s,%s,%s,%s)",[self.nick,str(self.chan),str(int(time.time())),int(self.network),self.uid])
	def sendLine(self,n1,n2,t,m,c,s,uid): #name 1, name 2, type, message, channel, source
		if self.banned:
			return False
		s = json.dumps({'line':{
			'curline':0,
			'type':t,
			'network':s,
			'time':int(time.time()),
			'name':n1,
			'message':m,
			'name2':n2,
			'chan':c,
			'uid':uid
		}})
		self.send_message(s)
	def handshake(self):
		data = makeUnicode(self.socket.recv(1024)).strip()
		upgrade = re.search('\nupgrade[\s]*:[\s]*websocket',data.lower())
		if not upgrade:
			return False
		print('Handshaking...')
		key = re.search('\n[sS]ec-[wW]eb[sS]ocket-[kK]ey[\s]*:[\s]*(.*)\r\n',data)
		if key:
			key = key.group(1)
		else:
			print('Missing Key!')
			return False
		digest = b64encode(sha1((key + self.magic).encode('utf-8')).digest()).strip().decode('utf-8')
		response = 'HTTP/1.1 101 Switching Protocols\r\n'
		response += 'Upgrade: websocket\r\n'
		response += 'Connection: Upgrade\r\n'
		response += 'Sec-WebSocket-Accept: %s\r\n\r\n' % digest
		self.handshake_done = self.socket.send(bytes(response,'utf-8'))
		return True
	def checkRelog(self,r,m):
		if 'relog' in r:
			self.send_message(json.dumps({'relog':r['relog']}))
			if r['relog']==2:
				self.msgStack.append(m)
	def on_message(self,m):
		try:
			if 'action' in m:
				if m['action'] == 'ident':
					try:
						r = execPhp('omnomirc.php',{
							'ident':'',
							'nick':b64encode_wrap(m['nick']),
							'signature':b64encode_wrap(m['signature']),
							'time':m['time'],
							'id':m['id'],
							'network':m['network']
						})
					except:
						traceback.print_exc()
						self.identified = False
						self.send_message(json.dumps({'relog':3}))
						return True
					try:
						self.banned = r['isbanned']
						if r['loggedin']:
							self.identified = True
							self.nick = m['nick']
							self.sig = m['signature']
							self.uid = m['id']
							self.network = m['network']
							for a in self.msgStack: # let's pop the whole stack!
								self.on_message(a)
							self.msgStack = []
						else:
							self.identified = False
							self.nick = ''
						if 'relog' in r:
							self.send_message(json.dumps({'relog':r['relog']}))
					except:
						self.identified = False
				elif m['action'] == 'chan':
					if self.identified:
						self.part()
					self.chan = m['chan']
					try:
						c = str(int(self.chan))
					except:
						c = b64encode_wrap(self.chan)
					r = execPhp('omnomirc.php',{
						'ident':'',
						'nick':b64encode_wrap(self.nick),
						'signature':b64encode_wrap(self.sig),
						'time':str(int(time.time())),
						'id':self.uid,
						'network':self.network,
						'channel':c
					})
					self.checkRelog(r,m)
					self.banned = r['isbanned']
					if not self.banned and self.identified:
						self.join()
				elif self.identified:
					if m['action'] == 'message' and self.chan!='' and not self.banned:
						msg = m['message']
						if len(msg) <= 256 and len(msg) > 0:
							if msg[0] == '/':
								if len(msg) > 1 and msg[1]=='/': # normal message, erase trailing /
									self.addLine('message',msg[1:])
								else:
									if len(msg) > 4 and msg[0:4].lower() == '/me ': # /me message
										self.addLine('action',msg[4:])
									else:
										c = self.chan
										try:
											c = str(int(c))
										except:
											c = b64encode_wrap(c)
										
										r = execPhp('message.php',{
											'message':b64encode_wrap(msg),
											'channel':c,
											'nick':b64encode_wrap(self.nick),
											'signature':b64encode_wrap(self.sig),
											'time':str(int(time.time())),
											'id':self.uid,
											'network':self.network
										})
										self.checkRelog(r,m)
							else: # normal message
								self.addLine('message',msg)
		except:
			traceback.print_exc()
		return True
	def close(self):
		print('connection closed')
		try:
			self.part()
			self.socket.close()
		except:
			pass
		return False

class RelayWebsockets(OircRelay):
	relayType = 1
	def initRelay(self):
		if config.json['websockets']['ssl']:
			self.server = SSLServer(self.config['host'],self.config['port'],WebSocketsHandler)
		else:
			self.server = Server(self.config['host'],self.config['port'],WebSocketsHandler)
	def startRelay(self):
		self.server.start()
	def stopRelay(self):
		for client in self.server.inputHandlers:
			client.sendLine('OmnomIRC','','reload_userlist','THE GAME',client.nick,0,-1)
		self.server.stop()
	def relayMessage(self,n1,n2,t,m,c,s,uid): #self.server.inputHandlers
		oircOnly = False
		try:
			c = int(c)
		except:
			oircOnly = True
		for client in self.server.inputHandlers:
			try:
				if ((not client.banned) and
					(
						(
							(
								(
									(
										(not oircOnly) or c[0]=='@'
									)
									and
									c == client.chan
								)
								or
								(
									client.network == s
									and
									(
										c==client.nick
										or
										n1==client.nick
									)
									and
									client.identified
								)
							)
							and t!='server'
						)
						or
						(
							t=='server'
							and
							c==client.nick
							and
							n2==str(client.chan)
							and
							client.identified
						)
					)):
					client.sendLine(n1,n2,t,m,c,s,uid)
			except Exception as inst:
				print(inst)
				traceback.print_exc()




#gCn bridge
class CalculatorHandler(ServerHandler):
	connectedToIRC=False
	chan=''
	calcName=''
	stopnow=False
	def userJoin(self):
		c = self.chanToId(self.chan)
		if c!=-1:
			handle.addUser(self.calcName,c,self.i)
	def userPart(self):
		c = self.chanToId(self.chan)
		if c!=-1:
			handle.removeUser(self.calcName,c,self.i)
	def close(self):
		traceback.print_stack()
		print('Giving signal to quit calculator...')
		try:
			self.sendToIRC('quit','')
			self.userPart()
		except:
			pass
		try:
			self.send(b'\xAD**** Server going down! ****')
		except:
			pass
		try:
			self.socket.close()
		except:
			pass
	def checkExit(self):
		if self.stopnow:
			print('exiting...')
			exit()
	def sendToIRC(self,t,m):
		c = self.chanToId(self.chan)
		if c!=-1:
			handle.sendToOther(self.calcName,'',t,m,c,self.i)
			sql.query("INSERT INTO `irc_lines` (`name1`,`name2`,`message`,`type`,`channel`,`time`,`online`) VALUES (%s,%s,%s,%s,%s,%s,%s)",[self.calcName,'',m,t,c,str(int(time.time())),int(self.i)])
			handle.updateCurline()
	def sendLine(self,n1,n2,t,m,c,s): #name 1, name 2, type, message, channel, source
		c = self.idToChan(c)
		if c!=-1:
			if t=='message':
				self.send(b'\xAD'+bytes('%s:%s' % (n1,m),'utf-8'))
			elif t=='action':
				self.send(b'\xAD'+bytes('*%s %s' % (n1,m),'utf-8'))
			elif t=='join':
				self.send(b'\xAD'+bytes('*%s has joined %s' % (n1,c),'utf-8'))
			elif t=='part':
				self.send(b'\xAD'+bytes('*%s has left %s (%s)' % (n1,c,m),'utf-8'))
			elif t=='quit':
				self.send(b'\xAD'+bytes('*%s has quit %s (%s)' % (n1,c,m),'utf-8'))
			elif t=='mode':
				self.send(b'\xAD'+bytes('*%s set %s mode %s' % (n1,c,m),'utf-8'))
			elif t=='kick':
				self.send(b'\xAD'+bytes('*%s has kicked %s from %s (%s)' % (n1,n2,c,m),'utf-8'))
			elif t=='topic':
				self.send(b'\xAD'+bytes('*%s has changed the topic to %s' % (n1,m),'utf-8'))
			elif t=='nick':
				self.send(b'\xAD'+bytes('*%s has changed nicks to %s' % (n1,n2),'utf-8'))
	def send(self,message):
		try:
			try:
				message = bytes(message,'utf-8')
			except:
				pass
			message = b'\xFF\x89\x00\x00\x00\x00\x00Omnom'+struct.pack('<H',len(message))+message
			message = struct.pack('<H',len(message)+1)+b'b'+message+b'*'
			self.socket.sendall(message)
		except Exception as inst:
			traceback.print_exc()
	def idToChan(self,i):
		if i in self.chans:
			return self.chans[i]
		return -1
	def chanToId(self,c):
		for i,ch in self.chans.items():
			if c.lower() == ch.lower():
				return i
		return -1
	def findchan(self,chan):
		for key,value in self.chans.items():
			if chan.lower() == value.lower():
				return True
				break
		return False
	def setup(self):
		global config
		print('New calculator\n')
		self.chans = {}
		self.defaultChan = ''
		print(self.i)
		for ch in config.json['channels']:
			if ch['enabled']:
				for c in ch['networks']:
					if c['id'] == self.i:
						self.chans[ch['id']] = c['name']
						if self.defaultChan == '':
							self.defaultChan = c['name']
						break
		return True
	def recieve(self):
		try:
			r_bytes = self.socket.recv(1024)
		except socket.timeout:
			return True
		except Exception as err:
			print('Error:')
			print(err)
			return False
		data = makeUnicode(r_bytes)
		if len(r_bytes) == 0: # eof
			print('EOF recieved')
			return False
		try:
			printString = '';
			sendMessage = False
			if (r_bytes[2]==ord('j')):
				self.calcName=''
				self.chan=''
				for i in range(4, int(ord(data[3]))+4):
					self.chan=self.chan+data[i]
				for i in range(int(ord(data[3]))+5, int(ord(data[int(ord(data[3]))+4]))+int(ord(data[3]))+5):
					self.calcName=self.calcName+data[i]
				self.chan = self.chan.lower()
				printString+='Join-message recieved. Calc-Name:'+self.calcName+' Channel:'+self.chan+'\n'
				if not(self.findchan(self.chan)):
					printString+='Invalid channel, defaulting to '+self.defaultChan+'\n'
					self.chan=self.defaultChan
			if (r_bytes[2]==ord('c')):
				calcId=makeUnicode(r_bytes[3:])
				printString+='Calc-message recieved. Calc-ID:'+calcId+'\n'
			if (r_bytes[2]==ord('b') or r_bytes[2]==ord('f')):
				if r_bytes[17]==171:
					self.send(b'\xABOmnomIRC')
					if not self.connectedToIRC:
						printString+=self.calcName+' has joined\n'
						self.connectedToIRC=True
						self.send(b'\xAD**Now speeking in channel '+bytes(self.chan,'utf-8'))
						self.sendToIRC('join','')
						self.userJoin()
				elif r_bytes[17]==172:
					if self.connectedToIRC:
						printString+=self.calcName+' has quit\n'
						self.connectedToIRC=False
						self.userPart()
						self.sendToIRC('quit','')
				elif r_bytes[17]==173 and data[5:10]=='Omnom':
					printString+='msg ('+self.calcName+') '+data[data.find(':',18)+1:-1]+'\n'
					message=data[data.find(":",18)+1:-1]
					if message.split(' ')[0].lower()=='/join':
						if self.findchan(message[message.find(' ')+1:].lower()):
							self.sendToIRC('part','')
							self.userPart()
							self.chan=message[message.find(' ')+1:].lower()
							self.send(b'\xAD**Now speeking in channel '+bytes(self.chan,'utf-8'))
							self.sendToIRC('join','')
							self.userJoin()
						else:
							self.send(b'\xAD**Channel '+bytes(message[message.find(' ')+1:],'utf-8')+b' doesn\'t exist!')
					elif message.split(' ')[0].lower()=='/me':
						self.sendToIRC('action',message[message.find(' ')+1:])
					else:
						self.sendToIRC('message',message)
					
			if printString!='':
				print(printString)
		except Exception as inst:
			print(inst)
			traceback.print_exc()
		return True

class RelayCalcnet(OircRelay):
	relayType = 2
	def initRelay(self):
		self.server = Server(self.config['server'],self.config['port'],type('CalculatorHandler_anon',(CalculatorHandler,),{'i':self.id}))
	def startRelay(self):
		self.server.start()
	def stopRelay(self):
		self.server.stop()
	def relayMessage(self,n1,n2,t,m,c,s,uid = -1):
		for calc in self.server.inputHandlers:
			try:
				if calc.connectedToIRC and (not (s==self.id and n1==calc.calcName)) and calc.idToChan(c).lower()==calc.chan.lower():
					calc.sendLine(n1,n2,t,m,c,s)
			except Exception as inst:
				print(inst)
				traceback.print_exc()




#fetch lines off of OIRC
class OIRCLink(ServerHandler):
	readbuffer = ''
	def setup(self):
		return socket.gethostbyname('localhost') == self.client_address[0]
	def recieve(self):
		try:
			data = makeUnicode(self.socket.recv(1024))
			if not data: # EOF
				return False
			self.readbuffer += data
		except:
			traceback.print_exc()
			return False
		temp = self.readbuffer.split('\n')
		self.readbuffer = temp.pop()
		for line in temp:
			try:
				data = json.loads(line)
				if data['t'] == 'server_updateconfig':
					handle.updateConfig()
				else:
					handle.sendToOther(data['n1'],data['n2'],data['t'],data['m'],data['c'],data['s'],data['uid'])
					print('(oirc)>> '+str(data))
			except:
				traceback.print_exc()
		return True


#main handler
class Main():
	relays = []
	def __init__(self):
		global config
		self.bots = []
	def updateCurline(self):
		global config,sql
		try:
			f = open(config.json['settings']['curidFilePath'],'w')
			f.write(str(sql.query("SELECT MAX(line_number) AS max FROM irc_lines")[0]['max']))
			f.close()
		except Exception as inst:
			print('curline error')
			print(inst)
			traceback.print_exc()
	def addUser(self,u,c,i):
		temp = sql.query("SELECT usernum FROM irc_users WHERE username=%s AND channel=%s AND online=%s",[u,c,int(i)])
		if(len(temp)==0):
			sql.query("INSERT INTO `irc_users` (`username`,`channel`,`online`) VALUES (%s,%s,%s)",[u,c,int(i)])
		else:
			sql.query("UPDATE `irc_users` SET `isOnline`=1 WHERE `usernum`=%s",[int(temp[0]['usernum'])])
	def removeUser(self,u,c,i):
		sql.query("UPDATE `irc_users` SET `isOnline`=0 WHERE `username` = %s AND `channel` = %s AND online=%s",[u,c,int(i)])
	def getCurline(self):
		global config
		f = open(config.json['settings']['curidFilePath'])
		lines = f.readlines()
		f.close()
		if len(lines)>=1:
			return int(lines[0])
		return 0
	def sendTopicToOther(self,s,c,i):
		oircOnly = False
		try:
			int(c)
		except:
			oircOnly = True
		for r in self.relays:
			if (oircOnly and r.relayType==1) or not oircOnly:
				r.relayTopic(s,c,i)
	def sendToOther(self,n1,n2,t,m,c,s,uid = -1):
		oircOnly = False
		try:
			c = int(c)
		except:
			oircOnly = True
		for r in self.relays:
			if (oircOnly and r.relayType==1) or not oircOnly:
				try:
					r.relayMessage(n1,n2,t,m,c,s,uid)
				except:
					traceback.print_exc()
	def findRelay(self,id):
		for r in self.relays:
			if id == r.id:
				return r
		return False
	def addRelay(self,n):
		if n['type']==3: # irc
			self.relays.append(RelayIRC(n))
		elif n['type']==2: # calc
			self.relays.append(RelayCalcnet(n))
	def updateConfig(self):
		print('(oirc) Got signal to update config!')
		config.readFile()
		for n in config.json['networks']:
			r = self.findRelay(n['id'])
			if not n['enabled'] and r:
				r.stopRelay_wrap()
				self.relays.remove(r)
				continue
			if n['enabled']:
				if r:
					r.updateRelay_wrap(n)
				else:
					size_before = len(self.relays)
					self.addRelay(n)
					if size_before < len(self.relays):
						self.relays[len(self.relays)-1].startRelay_wrap() # start it straigt away!
	def sigquit(self,e,s):
		print('sigquit')
		self.quit()
	def serve(self):
		signal.signal(signal.SIGQUIT,self.sigquit)
		self.calcNetwork = -1
		
		for n in config.json['networks']:
			if n['enabled']:
				self.addRelay(n)
		
		if config.json['websockets']['use']:
			self.relays.append(RelayWebsockets({
				'id':-1,
				'config':config.json['websockets']
			}));
		
		self.oircLink = Server('localhost',config.json['settings']['botPort'],OIRCLink)
		self.oircLink.start()
		
		try:
			for r in self.relays:
				r.startRelay_wrap()
			
			while True:
				time.sleep(30)
		except KeyboardInterrupt:
			print('KeyboardInterrupt, exiting...')
			self.quit()
		except:
			traceback.print_exc()
	def quit(self,code=1):
		global config
		for r in self.relays:
			r.stopRelay_wrap()
		self.oircLink.stop()
		
		sys.exit(code)


config = Config()
sql = Sql()
sql.query('DELETE FROM `irc_outgoing_messages`')
handle = Main()
handle.serve()