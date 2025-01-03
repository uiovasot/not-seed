import React from 'react';
import {ActionFunctionArgs, json, LoaderFunctionArgs} from '@remix-run/node';
import {Form, Link, useLoaderData} from '@remix-run/react';

import {ArrowLeft, Trash2, UserMinus, UserPlus, Users} from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {Button} from '~/components/ui/button';
import {Input} from '~/components/ui/input';

import {Combobox} from '~/components/combobox';
import {Frame} from '~/components/frame';

import {User} from '@/system/user';

import {prisma} from '~/db.server';
import metaTitle from '~/utils/meta';
import {getUser} from '~/utils/sessions.server';
import {useUserSearch} from '~/utils/useUserSearch';

const ITEMS_PER_PAGE = 10;

export async function loader({request}: LoaderFunctionArgs) {
    const user = await getUser(request);

    if (!(await User.checkPermission('group', user))) {
        throw new Response('Forbidden', {status: 403});
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const skip = (page - 1) * ITEMS_PER_PAGE;

    const [totalGroups, groups] = await Promise.all([
        prisma.group.count(),
        prisma.group.findMany({
            skip,
            take: ITEMS_PER_PAGE,
            include: {
                users: {
                    include: {
                        user: true,
                    },
                },
            },
            orderBy: {
                id: 'desc',
            },
        }),
    ]);

    const totalPages = Math.ceil(totalGroups / ITEMS_PER_PAGE);

    return json({groups, page, totalPages});
}

export const meta = metaTitle<typeof loader>(() => `Group Management`);

function GroupMembershipForm({groupId}: {groupId: number}) {
    const {selectedUser, setSelectedUser, setSearchTerm, users} = useUserSearch();

    return (
        <>
            <Form method="post" className="flex flex-wrap gap-4 items-end mb-4 p-4 bg-gray-50 rounded-lg">
                <input type="hidden" name="_action" value="add_member" />
                <input type="hidden" name="groupId" value={groupId} />

                <div className="space-y-2">
                    <label className="text-sm font-medium">User</label>
                    <Combobox
                        value={selectedUser}
                        onChange={setSelectedUser}
                        options={users}
                        displayValue={(user) => user?.username || ''}
                        setSearchTerm={setSearchTerm}
                        className="w-52"
                        placeholder="Search users..."
                    />
                    <input type="hidden" name="userId" value={selectedUser?.id || ''} />
                </div>

                {!selectedUser && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">IP Address</label>
                        <Input type="text" name="ip" className="w-52" placeholder="IP address" />
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium">Log</label>
                    <Input name="log" className="w-52" placeholder="Enter reason for adding member..." />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Expiration</label>
                    <Input type="datetime-local" name="expiration" className="w-52" />
                </div>

                <Button type="submit" className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4" /> Add Member
                </Button>
            </Form>
        </>
    );
}

function RemoveMemberForm({membership}: {membership: {id: number; user?: {username: string} | null; ip: string | null}}) {
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);

    return (
        <>
            <Button onClick={() => setIsDialogOpen(true)} variant="ghost" size="sm" className="text-red-600 hover:text-red-700 size-8 p-0">
                <UserMinus className="w-4 h-4 m-auto" />
            </Button>

            <AlertDialog open={isDialogOpen} onOpenChange={(open) => setIsDialogOpen(open)}>
                <AlertDialogContent>
                    <Form method="post">
                        <AlertDialogHeader>
                            <AlertDialogTitle>그룹 사용자 제거</AlertDialogTitle>
                            <AlertDialogDescription>
                                <input type="hidden" name="_action" value="remove_member" />
                                <input type="hidden" name="membershipId" value={membership.id} />

                                <div className="space-y-4 mb-4">
                                    <Input name="log" className="w-full" placeholder="Enter reason for removing member..." />
                                </div>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction type="submit">제거</AlertDialogAction>
                        </AlertDialogFooter>{' '}
                    </Form>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export async function action({request}: ActionFunctionArgs) {
    const formData = await request.formData();
    const action = formData.get('_action') as string;
    const user = await getUser(request);
    const log = formData.get('log') as string;

    if (!user || !(await User.checkPermission('group', user))) {
        throw new Response('Forbidden', {status: 403});
    }

    switch (action) {
        case 'create_group': {
            const name = formData.get('name') as string;
            const note = formData.get('note') as string;

            await prisma.group.create({
                data: {
                    name,
                    note,
                },
            });
            break;
        }

        case 'delete_group': {
            const groupId = parseInt(formData.get('groupId') as string);
            await prisma.group.delete({
                where: {id: groupId},
            });
            break;
        }

        case 'add_member': {
            const groupId = parseInt(formData.get('groupId') as string);
            const userId = formData.has('userId')
                ? parseInt(formData.get('userId') as string)
                : formData.has('username')
                  ? (
                        await prisma.user.findUnique({
                            where: {
                                username: formData.get('username') as string,
                            },
                            select: {
                                id: true,
                            },
                        })
                    )?.id
                  : undefined;
            const expiration = formData.get('expiration') as string;
            const ip = formData.get('ip') as string;

            const membership = await prisma.groupUsers.create({
                data: {
                    groupId,
                    userId: userId || null,
                    ip: ip || null,
                    expiration: expiration ? Math.floor(new Date(expiration).getTime() / 1000) : null,
                },
                include: {
                    group: true,
                },
            });

            await prisma.permissionHistory.create({
                data: {
                    targetUser: userId
                        ? {
                              connect: {id: userId},
                          }
                        : undefined,
                    target: ip || undefined,
                    targetType: 'group',
                    action: membership.group.name,
                    type: 1,
                    user: {
                        connect: {id: user.id},
                    },
                    log,
                },
            });
            break;
        }

        case 'remove_member': {
            const membershipId = parseInt(formData.get('membershipId') as string);

            const membership = await prisma.groupUsers.findUnique({
                where: {id: membershipId},
                include: {group: true, user: true},
            });

            if (membership) {
                await prisma.groupUsers.delete({
                    where: {id: membershipId},
                });

                await prisma.permissionHistory.create({
                    data: {
                        targetUser: membership.userId
                            ? {
                                  connect: {id: membership.userId},
                              }
                            : undefined,
                        target: membership.ip || undefined,
                        targetType: 'group',
                        action: membership.group.name,
                        type: 2,
                        user: {
                            connect: {id: user.id},
                        },
                        log,
                    },
                });
            }
            break;
        }
    }

    return null;
}

export default function GroupRoute() {
    const {groups, page, totalPages} = useLoaderData<typeof loader>();

    return (
        <Frame>
            <div className="flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">그룹 관리</h1>
                    <Link to="/wiki">
                        <Button variant="ghost" size="sm" className="size-8 p-0">
                            <ArrowLeft className="h-4 w-4 m-auto" />
                        </Button>
                    </Link>
                </div>

                <div className="space-y-6">
                    <Form method="post" className="flex flex-wrap gap-4 items-end border-b pb-6">
                        <input type="hidden" name="_action" value="create_group" />

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Group Name</label>
                            <Input type="text" name="name" className="w-52" placeholder="Enter group name" required />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Note</label>
                            <Input type="text" name="note" className="w-64" placeholder="Group description..." />
                        </div>

                        <Button type="submit" className="flex items-center gap-2">
                            <Users className="w-4 h-4" /> Create Group
                        </Button>
                    </Form>

                    <div className="space-y-6">
                        {groups.map((group) => (
                            <div key={group.id} className="bg-background rounded-lg shadow-xs p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold">{group.name}</h3>
                                        <p className="text-sm text-gray-500">{group.note}</p>
                                    </div>
                                    {group.id !== 1 && (
                                        <Form method="post" className="flex">
                                            <input type="hidden" name="_action" value="delete_group" />
                                            <input type="hidden" name="groupId" value={group.id} />
                                            <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:text-red-700 size-8 p-0">
                                                <Trash2 className="w-4 h-4 m-auto" />
                                            </Button>
                                        </Form>
                                    )}
                                </div>

                                <GroupMembershipForm groupId={group.id} />

                                <div className="space-y-2">
                                    {group.users.map((membership) => (
                                        <div key={membership.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium">{membership.user?.username || membership.ip}</div>
                                                {membership.expiration && (
                                                    <div className="text-xs text-gray-500">Expires: {new Date(membership.expiration * 1000).toLocaleString()}</div>
                                                )}
                                            </div>
                                            <RemoveMemberForm membership={membership} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {totalPages > 1 && (
                            <div className="flex justify-between mt-4">
                                {page > 1 && (
                                    <Link to={`?page=${page - 1}`}>
                                        <Button variant="ghost">이전</Button>
                                    </Link>
                                )}
                                <span className="py-2">
                                    {page} / {totalPages}
                                </span>
                                {page < totalPages && (
                                    <Link to={`?page=${page + 1}`}>
                                        <Button variant="ghost">다음</Button>
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Frame>
    );
}
