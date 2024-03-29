import { Command, Ctx, On, Start, Update } from 'nestjs-telegraf'
import { UserGuard } from '../user/guards/user.guard'
import { Logger, UseGuards } from '@nestjs/common'
import { UserContext } from '../user/user-context'
import { BouncerService } from 'src/bouncer/bouncer.service'
import { Context } from 'telegraf'
import {
  Chat,
  ServiceMessageBundle,
} from 'telegraf/typings/core/types/typegram'

@Update()
export class BotUpdate {
  private readonly logger = new Logger('TelegrafException')

  constructor(private readonly bouncerService: BouncerService) {}
  @Start()
  @UseGuards(UserGuard)
  async onStart(@Ctx() ctx: UserContext) {
    const verifiedMessage = [`You are verified with the following details:`]
    for (const poDetail of ctx.session.poDetails) {
      verifiedMessage.push(
        `<b>Agency: </b>${poDetail.agency_name}\n<b>Department: </b>${poDetail.department_name}\n<b>Title: </b>${poDetail.employment_title}`,
      )
    }
    verifiedMessage.push(`\n/logout to log out`)
    verifiedMessage.push(`\n/invites to retrieve invites`)
    await ctx.replyWithHTML(
      `<b>Authenticated Public Officer</b>\n\n${verifiedMessage.join('\n')}`,
    )
  }

  @Command('logout')
  @UseGuards(UserGuard)
  async onLogout(@Ctx() ctx: UserContext) {
    ctx.session = undefined
    await ctx.replyWithHTML('You have successfully logged out.')
  }

  @Command('invites')
  @UseGuards(UserGuard)
  async onInvites(@Ctx() ctx: UserContext) {
    try {
      const groupInfo = await this.bouncerService.getGroups()
      const message =
        'You can join the following groups:\n\n' +
        groupInfo
          .map((group) => `${group.name}: ${group.invite_link}`)
          .join('\n')
      await ctx.replyWithHTML(message)
    } catch (err) {
      this.logger.log(
        `Error occurred when retrieving chat invite links: ${err}`,
      )
    }
  }

  @On('chat_join_request')
  async handleNewChatMembers(@Ctx() ctx: Context) {
    const { from: user, chat, user_chat_id: userChatId } = ctx.chatJoinRequest
    try {
      await this.bouncerService.handleNewChatMember(chat, user, userChatId)
    } catch (err) {
      this.logger.log(`Error when joining chat: ${err}`)
    }
  }

  @On('new_chat_members')
  async handleDirectInvite(@Ctx() ctx: Context) {
    const {
      chat: potentialChat,
      botInfo: { id: botId },
      message: potentialMessage,
    } = ctx

    const message = potentialMessage as ServiceMessageBundle
    const isNewUserMessage =
      message &&
      'new_chat_members' in message &&
      Array.isArray(message.new_chat_members)
    const chat = potentialChat as Chat.GroupChat
    const isGroupChat = chat && chat.title
    if (!isNewUserMessage || !isGroupChat) {
      return
    }
    try {
      await this.bouncerService.handleDirectInvite(
        chat.id,
        chat.title,
        botId,
        message.new_chat_members,
      )
    } catch (err) {
      this.logger.log(`Error when handling user joining chat: ${err}`)
    }
  }
}
