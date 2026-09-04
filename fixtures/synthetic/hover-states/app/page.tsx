"use client";
export default function HoverStates() {
  return <main>
    <Tooltip><TooltipTrigger data-testid="help-tip">Help</TooltipTrigger><TooltipContent>Help text</TooltipContent></Tooltip>
    <HoverCard><HoverCardTrigger data-testid="profile-card">Profile</HoverCardTrigger><HoverCardContent>Profile card</HoverCardContent></HoverCard>
    <DropdownMenu><DropdownMenuTrigger data-testid="products-menu">Products</DropdownMenuTrigger><DropdownMenuContent>Products menu</DropdownMenuContent></DropdownMenu>
    <button data-testid="account-popover" onMouseEnter={() => {}}>Account</button>
    <div className="group"><span>CSS only</span><div className="hidden group-hover:block">Not a transition</div></div>
  </main>;
}
