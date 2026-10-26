import React from "react";
import { test, expect, vi } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
    act,
} from "@testing-library/react";
import App from "./App";
import { SessionProvider, roles } from "./session";
import { createApi } from "./api";
import { Editor } from "./components";
function setup(role = roles[2], id = 301) {
    const user = {
        userId: id,
        fname: "Fixture",
        lname: "User",
        email: "fixture@example.test",
        role: { roleId: 33, roleName: role },
    };
    const rows = {
        buildings: [],
        facilities: [
            {
                facilityId: 30,
                buildingId: 1,
                facilityName: "Fixture hall",
                capacity: 20,
                status: "Available",
            },
        ],
        equipment: [],
        reservations: [],
        loans: [],
        maintenanceRequests: [],
        assignments: [],
        facilityTypes: [],
        equipmentCategories: [],
        staff: [],
    };
    const calls = [];
    let denyFacilities = false,
        deferWrite = null;
    const fetchImpl = vi.fn(async (url, options) => {
        calls.push({ url, options });
        const path = new URL(url, "http://fixture.test").pathname.replace(
            "/api",
            "",
        );
        let result;
        if (path === "/auth/login")
            result = { token: "synthetic-token", expiresIn: 900 };
        else if (path === "/auth/me") result = { user };
        else if (path === "/overview")
            result = {
                overview: {
                    buildings: rows.buildings.length,
                    facilities: rows.facilities.length,
                    equipment: 0,
                    reservations: rows.reservations.length,
                    loans: 0,
                    maintenance: 0,
                },
            };
        else if (path === "/reservation-statuses")
            result = {
                reservationStatuses: [
                    { statusId: 17, statusName: "Pending" },
                    { statusId: 29, statusName: "Approved" },
                    { statusId: 41, statusName: "Rejected" },
                    { statusId: 53, statusName: "Cancelled" },
                ],
            };
        else if (path === "/facilities" && denyFacilities)
            return {
                ok: false,
                status: 401,
                json: async () => ({ success: false }),
            };
        else if (options.method === "POST" && path === "/reservations") {
            if (deferWrite) await deferWrite;
            const reservation = {
                reservationId: 77,
                requestedBy: id,
                approvedBy: null,
                statusId: 17,
                ...JSON.parse(options.body),
                createdAt: new Date().toISOString(),
            };
            rows.reservations.push(reservation);
            result = { reservation };
        } else if (
            options.method === "POST" &&
            ["/loans", "/maintenance", "/assignments", "/buildings"].includes(
                path,
            )
        ) {
            const input = JSON.parse(options.body);
            const schema = {
                "/loans": ["loans", "loan", "loanId"],
                "/maintenance": [
                    "maintenanceRequests",
                    "maintenanceRequest",
                    "requestId",
                ],
                "/assignments": ["assignments", "assignment", "assignmentId"],
                "/buildings": ["buildings", "building", "buildingId"],
            }[path];
            const record = {
                [schema[2]]: 55,
                ...input,
                ...(path === "/loans"
                    ? { userId: id, loanStatus: "Pending" }
                    : {}),
            };
            rows[schema[0]].push(record);
            result = { [schema[1]]: record };
        } else if (
            /^\/loans\/\d+\/return$/.test(path) &&
            options.method === "POST"
        ) {
            const record = rows.loans.find(
                (row) => row.loanId === Number(path.split("/")[2]),
            );
            record.loanStatus = "Returned";
            result = { loan: record };
        } else if (
            options.method === "POST" &&
            /^\/reservations\/\d+\/(approve|reject|cancel)$/.test(path)
        ) {
            const [, , id, action] = path.split("/");
            const record = rows.reservations.find(
                (row) => row.reservationId === Number(id),
            );
            record.statusId = { approve: 29, reject: 41, cancel: 53 }[action];
            result = { reservation: record };
        } else if (
            options.method === "POST" &&
            /^\/maintenance\/\d+\/(assign|progress)$/.test(path)
        ) {
            const [, , id, action] = path.split("/");
            const record = rows.maintenanceRequests.find(
                (row) => row.requestId === Number(id),
            );
            const input = JSON.parse(options.body);
            if (action === "assign") record.assignedStaffId = input.staffId;
            else record.status = input.status;
            result = { maintenanceRequest: record };
        } else if (path === "/facility-types")
            result = { facilityTypes: rows.facilityTypes };
        else if (path === "/equipment-categories")
            result = { equipmentCategories: rows.equipmentCategories };
        else if (path === "/staff") result = { staff: rows.staff };
        else {
            const key =
                path === "/maintenance" ? "maintenanceRequests" : path.slice(1);
            if (!Object.hasOwn(rows, key))
                throw Error("Unexpected fixture route");
            result = { [key]: rows[key] };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                pagination: { page: 1, limit: 20, hasMore: false },
                ...result,
            }),
        };
    });
    const apiFactory = (options) => createApi({ ...options, fetchImpl });
    render(
        <SessionProvider apiFactory={apiFactory}>
            <App />
        </SessionProvider>,
    );
    return {
        calls,
        rows,
        user,
        setDenyFacilities(value) {
            denyFacilities = value;
        },
        deferWrite(value) {
            deferWrite = value;
        },
    };
}
async function login() {
    fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "fixture@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "synthetic-password" },
    });
    fireEvent.click(
        screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    await screen.findByRole("heading", { name: /Welcome back, Fixture/ });
}
async function navigate(name) {
    fireEvent.click(screen.getByRole("link", { name, exact: true }));
    await act(async () => {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
}
test("real session provider protects shell, exposes role navigation and clears memory on logout", async () => {
    const fixture = setup();
    expect(screen.queryByRole("navigation")).toBeNull();
    await login();
    expect(screen.getByRole("navigation")).toBeTruthy();
    expect(
        screen.queryByRole("link", { name: "Staff assignments" }),
    ).toBeNull();
    await navigate("Buildings");
    await screen.findByRole("heading", { name: "Buildings" });
    expect(screen.queryByRole("button", { name: /Add building/ })).toBeNull();
    fireEvent.click(screen.getByText("Fixture User"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(
        fixture.calls.some(
            (call) =>
                call.options.headers.Authorization === "Bearer synthetic-token",
        ),
    ).toBe(true);
    expect(localStorage.length).toBe(0);
});
test("administrator has management controls and empty states contain no demo records", async () => {
    setup(roles[0], 101);
    await login();
    expect(
        screen.getByRole("link", { name: "Staff assignments" }),
    ).toBeTruthy();
    await navigate("Buildings");
    await screen.findByRole("heading", { name: "Buildings" });
    await screen.findByText("No records found");
    expect(screen.getByRole("button", { name: /Add building/ })).toBeTruthy();
});
test("reservation form submits exactly four normalized fields once and re-fetches real data", async () => {
    const fixture = setup();
    await login();
    await navigate("Reservations");
    await screen.findByRole("heading", { name: "Reservations" });
    fireEvent.click(screen.getByRole("button", { name: /New reservation/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Facility ID"), {
        target: { value: "30" },
    });
    fireEvent.change(within(dialog).getByLabelText("Purpose"), {
        target: { value: "Fixture event" },
    });
    const pad = (n) => String(n).padStart(2, "0");
    const local = (date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const start = local(new Date(Date.now() + 2 * 86400000)),
        end = local(new Date(Date.now() + 2 * 86400000 + 3600000));
    fireEvent.change(within(dialog).getByLabelText("Start date & time"), {
        target: { value: start },
    });
    fireEvent.change(within(dialog).getByLabelText("End date & time"), {
        target: { value: end },
    });
    let done;
    fixture.deferWrite(
        new Promise((resolve) => {
            done = resolve;
        }),
    );
    const submit = within(dialog).getByRole("button", {
        name: "Submit request",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect(
        fixture.calls.filter(
            (call) =>
                call.url === "/api/reservations" &&
                call.options.method === "POST",
        ),
    ).toHaveLength(1);
    await act(async () => done());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByText("Fixture event");
    const write = fixture.calls.find(
        (call) =>
            call.url === "/api/reservations" && call.options.method === "POST",
    );
    expect(JSON.parse(write.options.body)).toEqual({
        facilityId: 30,
        purpose: "Fixture event",
        startDatetime: new Date(start).toISOString(),
        endDatetime: new Date(end).toISOString(),
    });
    expect(
        fixture.calls.filter((call) =>
            call.url.startsWith("/api/reservations?"),
        ).length,
    ).toBeGreaterThan(1);
});
test("401 during navigation expires the session and hides previous records", async () => {
    const fixture = setup();
    await login();
    fixture.setDenyFacilities(true);
    await navigate("Facilities");
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(screen.getByRole("status").textContent).toMatch(/session expired/i);
    expect(screen.queryByRole("navigation")).toBeNull();
});
test("catalog datalist uses facility identity rather than its building ID", () => {
    render(
        <Editor
            title="Fixture editor"
            fields={[]}
            catalogs={{
                facilities: [
                    {
                        facilityId: 30,
                        buildingId: 1,
                        facilityName: "Fixture hall",
                    },
                ],
            }}
            onSubmit={async () => {}}
            onClose={() => {}}
        />,
    );
    const option = document.querySelector("datalist option");
    expect(option.value).toBe("30");
});
test("uncertain mutations stay blocked and show reconciliation guidance without leaking diagnostics", async () => {
    const submit = vi.fn(async () => {
        throw Object.assign(Error("Refresh history before resubmitting."), {
            requiresRefresh: true,
        });
    });
    render(
        <Editor
            title="Confirm fixture"
            fields={[]}
            onSubmit={submit}
            onClose={() => {}}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Save changes" }).disabled).toBe(
        true,
    );
    expect(submit).toHaveBeenCalledTimes(1);
});

test("loan UI posts item quantities and due date without borrower overrides", async () => {
    const fixture = setup();
    await login();
    await navigate("Equipment loans");
    await screen.findByRole("heading", { name: "Equipment loans" });
    fireEvent.click(screen.getByRole("button", { name: /New loan/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Due date & time"), {
        target: { value: "2028-01-10T10:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Equipment ID"), {
        target: { value: "101" },
    });
    fireEvent.change(within(dialog).getByLabelText("Quantity"), {
        target: { value: "2" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Submit request" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const call = fixture.calls.find(
        (call) => call.url === "/api/loans" && call.options.method === "POST",
    );
    expect(JSON.parse(call.options.body)).toEqual({
        dueDate: new Date("2028-01-10T10:00").toISOString(),
        items: [{ equipmentId: 101, quantity: 2 }],
    });
});
test("maintenance UI sends one target and preserves multiline description", async () => {
    const fixture = setup();
    await login();
    await navigate("Maintenance");
    await screen.findByRole("heading", { name: "Maintenance" });
    fireEvent.click(
        screen.getByRole("button", { name: /New maintenance request/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Target"), {
        target: { value: "equipmentId" },
    });
    fireEvent.change(within(dialog).getByLabelText("Target ID"), {
        target: { value: "101" },
    });
    fireEvent.change(within(dialog).getByLabelText("Description"), {
        target: { value: "Fixture issue\nSecond line" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Submit request" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const call = fixture.calls.find(
        (call) =>
            call.url === "/api/maintenance" && call.options.method === "POST",
    );
    expect(JSON.parse(call.options.body)).toEqual({
        equipmentId: 101,
        description: "Fixture issue\nSecond line",
        priority: "Normal",
    });
});
test("administrator assignment form uses eligible staff ID and approved role/shift fields", async () => {
    const fixture = setup(roles[0], 101);
    await login();
    await navigate("Staff assignments");
    await screen.findByRole("heading", { name: "Staff assignments" });
    fireEvent.click(screen.getByRole("button", { name: /Create assignment/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Facility ID"), {
        target: { value: "30" },
    });
    fireEvent.change(within(dialog).getByLabelText("Staff user ID"), {
        target: { value: "201" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Submit request" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const call = fixture.calls.find(
        (call) =>
            call.url === "/api/assignments" && call.options.method === "POST",
    );
    expect(JSON.parse(call.options.body)).toEqual({
        facilityId: 30,
        staffId: 201,
        assignedRole: "Custodian",
        shift: null,
        assignedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
});
test("administrator records returns only after explicit dialog confirmation", async () => {
    const fixture = setup(roles[0], 101);
    fixture.rows.loans.push({
        loanId: 13,
        userId: 301,
        loanStatus: "Approved",
        dueDate: new Date().toISOString(),
        items: [{ equipmentId: 101, quantity: 2 }],
    });
    await login();
    await navigate("Equipment loans");
    await screen.findByRole("button", { name: "Return" });
    expect(
        fixture.calls.some(
            (call) =>
                call.options.method === "POST" && call.url.includes("/return"),
        ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), {
        target: { value: "Damaged" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: /Confirm record return/ }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const call = fixture.calls.find(
        (call) => call.url === "/api/loans/13/return",
    );
    expect(JSON.parse(call.options.body)).toEqual({
        items: [{ equipmentId: 101, conditionIn: "Damaged" }],
    });
});

test.each(["missing-workspace", "__proto__", "constructor"])(
    "unknown route %s is a not-found view rather than an inherited object property",
    async (route) => {
        setup();
        await login();
        window.location.hash = "#/" + route;
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        await screen.findByRole("heading", { name: "Page not found" });
        expect(screen.queryByRole("dialog")).toBeNull();
    },
);

test("staff navigation and maintenance claim/progress use fixed endpoints and actor-safe bodies", async () => {
    const fixture = setup(roles[1], 201);
    fixture.rows.maintenanceRequests.push({
        requestId: 65,
        facilityId: 30,
        equipmentId: null,
        reportedBy: 201,
        assignedStaffId: null,
        description: "Synthetic local staff report",
        priority: "Normal",
        status: "Open",
    });
    fixture.rows.assignments.push({
        assignmentId: 9,
        facilityId: 30,
        staffId: 201,
        assignedRole: "Custodian",
        shift: "Day",
        assignedDate: "2026-01-01T00:00:00.000Z",
        unassignedDate: null,
    });
    await login();
    await navigate("Staff assignments");
    await screen.findByText("Custodian");
    expect(
        screen.queryByRole("button", { name: /Create assignment/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "End" })).toBeNull();
    await navigate("Maintenance");
    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));
    fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
            name: "Confirm claim maintenance",
        }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
        JSON.parse(
            fixture.calls.find(
                (call) => call.url === "/api/maintenance/65/assign",
            ).options.body,
        ),
    ).toEqual({ staffId: 201 });
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Maintenance action"), {
        target: { value: "Synthetic inspection" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirm start work" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
        JSON.parse(
            fixture.calls.find(
                (call) => call.url === "/api/maintenance/65/progress",
            ).options.body,
        ),
    ).toEqual({ status: "In Progress", actionTaken: "Synthetic inspection" });
    await screen.findByRole("button", { name: "Resolve" });
});

test.each(["approve", "reject"])(
    "administrator %s requires confirmation and hides self-review",
    async (action) => {
        const fixture = setup(roles[0], 101);
        for (const [id, requestedBy] of [
            [70, 301],
            [71, 101],
        ])
            fixture.rows.reservations.push({
                reservationId: id,
                facilityId: 30,
                requestedBy,
                approvedBy: null,
                statusId: 17,
                purpose: "Synthetic request " + id,
                startDatetime: new Date(Date.now() + 86400000).toISOString(),
                endDatetime: new Date(Date.now() + 90000000).toISOString(),
                createdAt: new Date().toISOString(),
            });
        await login();
        await navigate("Reservations");
        const caption = action === "approve" ? "Approve" : "Reject";
        const button = await screen.findByRole("button", { name: caption });
        expect(screen.getAllByRole("button", { name: caption })).toHaveLength(
            1,
        );
        expect(
            fixture.calls.some((call) => call.url.endsWith("/" + action)),
        ).toBe(false);
        fireEvent.click(button);
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByRole("heading").textContent).toContain(
            "#70",
        );
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Confirm " + action }),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const call = fixture.calls.find(
            (call) => call.url === "/api/reservations/70/" + action,
        );
        expect(call.options.method).toBe("POST");
        expect(JSON.parse(call.options.body)).toEqual({});
    },
);

test("representative cancellation preserves actor controls and direct assignment navigation is denied", async () => {
    const fixture = setup();
    fixture.rows.reservations.push({
        reservationId: 80,
        facilityId: 30,
        requestedBy: 301,
        statusId: 17,
        purpose: "Synthetic own request",
        startDatetime: new Date(Date.now() + 86400000).toISOString(),
        endDatetime: new Date(Date.now() + 90000000).toISOString(),
    });
    await login();
    await navigate("Reservations");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
            name: "Confirm cancel reservation",
        }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
        JSON.parse(
            fixture.calls.find(
                (call) => call.url === "/api/reservations/80/cancel",
            ).options.body,
        ),
    ).toEqual({});
    window.location.hash = "#/assignments";
    await act(async () =>
        window.dispatchEvent(new HashChangeEvent("hashchange")),
    );
    await screen.findByRole("heading", { name: "Access restricted" });
    expect(
        fixture.calls.some((call) => call.url.startsWith("/api/assignments")),
    ).toBe(false);
});
