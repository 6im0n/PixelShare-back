import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsUUID } from 'class-validator';

const INVITATION_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

class AddInvitationLibraryDto {
  @IsUUID()
  libraryId!: string;
}
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/current-user.decorator';
import { Public } from '../../shared/public.decorator';
import { Roles } from '../../shared/roles.decorator';
import { RolesGuard } from '../../shared/roles.guard';
import type { AuthUser } from '../../shared/types';
import { CreateInvitationDto } from './dto/invitations.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Throttle({ lookup: { limit: 20, ttl: 60_000 } })
  @Get('lookup/:code')
  lookup(@Param('code') code: string) {
    const normalized = code?.toUpperCase() ?? '';
    if (!INVITATION_CODE_RE.test(normalized)) {
      throw new BadRequestException('invalid invitation code format');
    }
    return this.invitations.lookup(normalized);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.invitations.list(user);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Post(':id/resend')
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invitations.resendInvitation(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Post(':id/libraries')
  addLibrary(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddInvitationLibraryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invitations.addLibrary(id, dto.libraryId, user);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'photographer')
  @Delete(':id')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invitations.revoke(id, user);
  }
}
