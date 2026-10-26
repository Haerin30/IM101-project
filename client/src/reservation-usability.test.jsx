import React, { useState } from "react";
import { test, expect, vi } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";
import {
    formatDate,
    formatValue,
    purposePreview,
    displayValue,
    recordName,
} from "./presentation";
import { useRecordNames } from "./names";
import { Editor, RecordDetails } from "./components";
import Calendar, { reservationBatch, monthDays } from "./ReservationCalendar";

const catalogs = {
    facilities: [{ facilityId: 98765, facilityName: "Science Seminar Hall" }],
    equipment: [{ equipmentId: 87654, equipmentName: "Portable Projector" }],
    statuses: [
        { statusId: 918, statusName: "Approved" },
        { statusId: 217, statusName: "Pending" },
        { statusId: 741, statusName: "Rejected" },
        { statusId: 853, statusName: "Cancelled" },
    ],
};
function row(
    id,
    statusId = 918,
    purpose = "Research symposium\nFull agenda and accessibility arrangements.",
) {
    const now = new Date();
    return {
        reservationId: id,
        facilityId: 98765,
        requestedBy: 301,
        approvedBy: 101,
        statusId,
        purpose,
        startDatetime: new Date(
            now.getFullYear(),
            now.getMonth(),
            10,
            9,
        ).toISOString(),
        endDatetime: new Date(
            now.getFullYear(),
            now.getMonth(),
            10,
            10,
        ).toISOString(),
        createdAt: new Date().toISOString(),
    };
}
test("shared dates use numeric month/day/year, zero-padded time and explicit AM/PM", () => {
    expect(formatDate(new Date(2027, 0, 2, 9, 5).toISOString())).toBe(
        "01/02/2027 09:05 AM",
    );
    expect(formatDate(new Date(2027, 0, 2, 15, 7).toISOString())).toBe(
        "01/02/2027 03:07 PM",
    );
    expect(formatDate(new Date(2027, 0, 2, 0, 0).toISOString())).toBe(
        "01/02/2027 12:00 AM",
    );
    expect(formatValue("2027-01-02T00:00:00.000Z", "assignedDate")).toBe(
        "01/02/2027",
    );
    expect(formatValue("2027-02-30", "assignedDate")).toBe("Unavailable");
    expect(formatDate("not-a-date")).toBe("Unavailable");
    expect(formatDate("2027-01-02T09:00:00+08:00")).toBe(
        formatDate("2027-01-02T01:00:00Z"),
    );
});
test("purpose previews use the first meaningful line or sentence and truncate Unicode safely", () => {
    expect(
        purposePreview(
            "\n Planning meeting\nConfidential synthetic second line",
        ),
    ).toBe("Planning meeting");
    expect(purposePreview("Faculty forum. Detailed preparation follows.")).toBe(
        "Faculty forum.",
    );
    expect(purposePreview("Campus meeting; please reserve seating")).toBe(
        "Campus meeting",
    );
    expect(purposePreview("😀".repeat(100))).toBe("😀".repeat(64) + "…");
    expect(purposePreview("   ")).toBe("Untitled reservation");
});
test("table display helpers replace facility and equipment IDs with public names", () => {
    expect(displayValue({ facilityId: 98765 }, "facilityId", catalogs)).toBe(
        "Science Seminar Hall",
    );
    expect(
        displayValue({ homeFacilityId: 98765 }, "homeFacilityId", catalogs),
    ).toBe("Science Seminar Hall");
    expect(displayValue({ equipmentId: 87654 }, "equipmentId", catalogs)).toBe(
        "Portable Projector",
    );
    expect(recordName(999999, "equipment", catalogs)).toBe(
        "Equipment unavailable",
    );
    expect(recordName(null, "facility", catalogs)).toBe("—");
});
test("details retain the complete multiline purpose and show names for targets and loan items", async () => {
    const full =
        "Research symposium\nFull agenda with <script>plain text</script> and accessibility arrangements.";
    render(
        <RecordDetails
            row={{
                ...row(1, 918, full),
                equipmentId: 87654,
                items: [
                    {
                        equipmentId: 87654,
                        quantity: 2,
                        conditionOut: "Good",
                        conditionIn: null,
                    },
                ],
            }}
            catalogs={catalogs}
            onClose={() => {}}
        />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Full purpose")).toBeTruthy();
    expect(dialog.querySelector(".full-purpose").textContent).toBe(full);
    expect(within(dialog).getByText("Science Seminar Hall")).toBeTruthy();
    expect(dialog.textContent).toContain("Portable Projector");
    expect(dialog.textContent).not.toContain("98765");
    expect(dialog.textContent).not.toContain("87654");
    expect(dialog.querySelector("script")).toBeNull();
});
test("name selectors submit internal IDs without exposing numeric option labels", async () => {
    const submit = vi.fn(async () => {});
    render(
        <Editor
            title="Reservation choice"
            fields={[["facilityId", "Facility", "number", "facilities"]]}
            catalogs={catalogs}
            onSubmit={submit}
            onClose={() => {}}
        />,
    );
    const select = screen.getByRole("combobox", { name: "Facility" });
    expect(
        within(select).getByRole("option", { name: "Science Seminar Hall" })
            .value,
    ).toBe("98765");
    expect(select.textContent).not.toContain("98765");
    fireEvent.change(select, { target: { value: "98765" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
        expect(submit).toHaveBeenCalledWith({ facilityId: 98765 }),
    );
});
test("loan return selectors identify equipment by name", () => {
    render(
        <Editor
            title="Return equipment"
            fields={[]}
            catalogs={catalogs}
            returnItems={[{ equipmentId: 87654, quantity: 2 }]}
            onSubmit={async () => {}}
            onClose={() => {}}
        />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Portable Projector");
    expect(dialog.textContent).not.toContain("87654");
});

test("name selectors offer an explicit way to fetch additional choices", async () => {
    const more = vi.fn();
    const props = {
        title: "More facilities",
        fields: [["facilityId", "Facility", "number", "facilities"]],
        onSubmit: async () => {},
        onClose: () => {},
    };
    const { rerender } = render(
        <Editor
            {...props}
            catalogs={{
                ...catalogs,
                hasMore: { facilities: true },
                loadMore: more,
            }}
        />,
    );
    fireEvent.click(
        screen.getByRole("button", { name: "Load more facilities" }),
    );
    expect(more).toHaveBeenCalledWith("facilities");
    rerender(
        <Editor
            {...props}
            catalogs={{
                ...catalogs,
                facilities: [
                    ...catalogs.facilities,
                    { facilityId: 43210, facilityName: "West Campus Hall" },
                ],
            }}
        />,
    );
    expect(screen.getByRole("option", { name: "West Campus Hall" }).value).toBe(
        "43210",
    );
});
test("names beyond the first catalog page resolve through fixed authenticated GET endpoints", async () => {
    const api = {
        request: vi.fn(async (path) =>
            path === "/facilities/22222"
                ? {
                      facility: {
                          facilityId: 22222,
                          facilityName: "Additional Hall",
                      },
                  }
                : {
                      equipment: {
                          equipmentId: 33333,
                          equipmentName: "Additional Camera",
                      },
                  },
        ),
    };
    function Names() {
        const resolved = useRecordNames(
            [
                {
                    facilityId: 22222,
                    items: [{ equipmentId: 33333 }, { equipmentId: 33333 }],
                },
            ],
            catalogs,
            api,
        );
        return (
            <p>
                {recordName(22222, "facility", resolved)} /{" "}
                {recordName(33333, "equipment", resolved)}
            </p>
        );
    }
    render(<Names />);
    await screen.findByText("Additional Hall / Additional Camera");
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request.mock.calls.map((call) => call[0]).sort()).toEqual([
        "/equipment/33333",
        "/facilities/22222",
    ]);
});
test("failed catalog resolution displays neutral text without IDs or private diagnostics", async () => {
    const api = {
        request: vi.fn(async () => {
            throw Error("PRIVATE-fixture-diagnostic");
        }),
    };
    function Missing() {
        const resolved = useRecordNames([{ facilityId: 55555 }], catalogs, api);
        return <p>{recordName(55555, "facility", resolved)}</p>;
    }
    render(<Missing />);
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Facility unavailable")).toBeTruthy();
    expect(document.body.textContent).not.toContain("55555");
    expect(document.body.textContent).not.toContain("PRIVATE");
});
test("calendar shows only Approved records, names and previews; click opens full details", async () => {
    const events = [
        row(1),
        row(2, 217, "Pending planning"),
        row(3, 741, "Rejected event"),
        row(4, 853, "Cancelled event"),
    ];
    const api = {
        request: vi.fn(async () => ({
            reservations: events,
            pagination: { hasMore: false },
        })),
    };
    function CalendarDemo() {
        const [selected, setSelected] = useState(null);
        return (
            <>
                <Calendar
                    api={api}
                    catalogs={catalogs}
                    onSelect={setSelected}
                />
                {selected && (
                    <RecordDetails
                        row={selected}
                        catalogs={catalogs}
                        onClose={() => setSelected(null)}
                    />
                )}
            </>
        );
    }
    render(<CalendarDemo />);
    const button = await screen.findByRole("button", {
        name: /Research symposium.*Science Seminar Hall/,
    });
    expect(button.textContent).toContain(formatDate(events[0].startDatetime));
    expect(button.textContent).not.toContain("Full agenda");
    for (const title of [
        "Pending planning",
        "Rejected event",
        "Cancelled event",
    ])
        expect(screen.queryByText(title)).toBeNull();
    fireEvent.click(button);
    expect(
        screen.getByRole("dialog").querySelector(".full-purpose").textContent,
    ).toBe(events[0].purpose);
    expect(api.request.mock.calls[0][0]).toBe("/reservations?page=1&limit=100");
    expect(
        screen.getByText(/not a campus-wide availability calendar/),
    ).toBeTruthy();
});
test("calendar walks bounded scoped pages and includes approvals beyond page one", async () => {
    const api = {
        request: vi.fn(async (path) =>
            path.includes("page=1&")
                ? {
                      reservations: [row(1, 217, "Pending")],
                      pagination: { hasMore: true },
                  }
                : {
                      reservations: [row(2, 918, "Later-page symposium")],
                      pagination: { hasMore: false },
                  },
        ),
    };
    render(<Calendar api={api} catalogs={catalogs} onSelect={() => {}} />);
    await screen.findByRole("button", { name: /Later-page symposium/ });
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(
        screen.queryByRole("button", { name: /Pending.*Science/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(api.request).toHaveBeenCalledTimes(2);
});
test("calendar batches stop at ten bounded pages and explicitly expose continuation", async () => {
    const api = {
        request: vi.fn(async () => ({
            reservations: [],
            pagination: { hasMore: true },
        })),
    };
    expect(
        (await reservationBatch(api, new AbortController().signal)).next,
    ).toBe(11);
    expect(api.request).toHaveBeenCalledTimes(10);
    expect(
        api.request.mock.calls.every((call) =>
            /^\/reservations\?page=\d+&limit=100$/.test(call[0]),
        ),
    ).toBe(true);
    render(<Calendar api={api} catalogs={catalogs} onSelect={() => {}} />);
    await screen.findByRole("button", { name: "Load more reservations" });
    expect(screen.getByText(/Only loaded history is shown/)).toBeTruthy();
});
test("missing Approved lookup fails closed and month days use local calendar boundaries", async () => {
    const api = {
        request: vi.fn(async () => ({
            reservations: [row(1)],
            pagination: { hasMore: false },
        })),
    };
    render(
        <Calendar
            api={api}
            catalogs={{ ...catalogs, statuses: [] }}
            onSelect={() => {}}
        />,
    );
    await screen.findByText(
        "The Approved reservation status is not configured.",
    );
    expect(
        screen.queryByRole("button", { name: /Research symposium/ }),
    ).toBeNull();
    const days = monthDays(new Date(2028, 1, 1));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(0);
    expect(days.filter((day) => day.getMonth() === 1)).toHaveLength(29);
});

test("calendar refresh retries catalog reads as well as reservation history", async () => {
    const api = {
            request: vi.fn(async () => ({
                reservations: [],
                pagination: { hasMore: false },
            })),
        },
        retry = vi.fn();
    render(
        <Calendar
            api={api}
            catalogs={{ unavailable: true }}
            onSelect={() => {}}
            onRefreshCatalogs={retry}
        />,
    );
    await screen.findByText(
        "Reservation statuses are unavailable. Refresh the calendar to try again.",
    );
    const button = screen.getByRole("button", { name: "Refresh calendar" });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
});
