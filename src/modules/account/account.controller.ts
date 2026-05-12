import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/current-user.decorator';
import { Roles } from '../../shared/roles.decorator';
import { RolesGuard } from '../../shared/roles.guard';
import type { AuthUser } from '../../shared/types';
import { AccountService } from './account.service';
import { RequestEmailChangeDto, UpdateMeDto, UpdateUserDto } from './dto/account.dto';

@ApiBearerAuth()
@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.account.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.account.updateMe(user.id, dto);
  }

  @Post('me/email-change')
  requestEmailChange(@CurrentUser() user: AuthUser, @Body() dto: RequestEmailChangeDto) {
    return this.account.requestEmailChange(user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Get('clients')
  listClients() {
    return this.account.listClients();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('users')
  listUsers() {
    return this.account.listUsers();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('users/:id/libraries')
  getUserLibraries(@Param('id', ParseUUIDPipe) id: string) {
    return this.account.getUserLibraries(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch('users/:id')
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.account.updateUser(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete('users/:id')
  deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.account.deleteUser(id);
  }
}
