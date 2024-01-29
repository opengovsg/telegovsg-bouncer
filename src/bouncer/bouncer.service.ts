import { Injectable, Logger } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { DatabaseService } from 'src/database/database.service'
import { Telegraf } from 'telegraf'
import { Chat, User } from 'telegraf/typings/core/types/typegram'

@Injectable()
export class BouncerService {
  private readonly logger = new Logger('TelegrafException')

  constructor(
    @InjectBot() private bot: Telegraf,
    private readonly databaseService: DatabaseService,
  ) {}

  async getGroups() {
    return this.databaseService.bouncerStore
      .selectFrom('chat')
      .selectAll()
      .execute()
  }

  async handleNewChatMember(chat: Chat, user: User, userChatId: number) {
    const { id: chatId } = chat
    const { id: userId, first_name } = user
    const possibleUser = await this.databaseService.store.get(userId.toString())
    if (possibleUser.poDetails && possibleUser.poDetails.length !== 0) {
      // User is a public officer
      await this.bot.telegram.approveChatJoinRequest(chatId, userId)
      this.logger.log(
        `Allowing user ${first_name} with id: ${userId} to join chat ${chatId}`,
      )
    } else {
      await this.bot.telegram.declineChatJoinRequest(chatId, userId)
      this.logger.log(
        `User ${first_name} with id: ${userId} attempted to join chat ${chatId} without authorization: rejecting request`,
      )
      await this.bot.telegram.sendMessage(
        chatId,
        `User [${first_name}](tg://user?id=${userId}) attempted to join chat without authorization: rejecting request`,
        {
          parse_mode: 'Markdown',
        },
      )
      await this.bot.telegram.sendMessage(
        userChatId,
        'Please verify your identity and join the group via the link provided! Use "/start" to begin',
      )
    }
  }

  async handleDirectInvite(
    chatId: number,
    chatTitle: string,
    botId: number,
    newChatMembers: User[],
  ) {
    for (const user of newChatMembers) {
      const { id: userId, first_name } = user
      if (user.id === botId) {
        const inviteLink = await this.bot.telegram.createChatInviteLink(
          chatId,
          {
            creates_join_request: true,
          },
        )
        await this.databaseService.bouncerStore
          .insertInto('chat')
          .values({
            name: chatTitle,
            chat_id: chatId,
            invite_link: inviteLink.invite_link,
          })
          .executeTakeFirst()
        this.logger.log(`Bot added to chat ${chatTitle} with id ${chatId}`)
        continue
      }
      const timeUntilBanLifted = new Date().getTime() + 1000 * 60
      const possibleUser = await this.databaseService.store.get(
        userId.toString(),
      )
      const isPublicOfficer =
        possibleUser.poDetails && possibleUser.poDetails.length !== 0
      if (!isPublicOfficer) {
        await this.bot.telegram.banChatMember(
          chatId,
          userId,
          timeUntilBanLifted,
        )
        this.logger.log(
          `User ${first_name} with id: ${userId} attempted to join chat ${chatId} via direct link: removing from group`,
        )
        await this.bot.telegram.sendMessage(
          chatId,
          `User [${first_name}](tg://user?id=${userId}) attempted to join chat via direct link: removing from group`,
          {
            parse_mode: 'Markdown',
          },
        )
      }
    }
  }
}
